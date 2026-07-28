import type {
  AudienceContext,
  AudienceRule,
  AudienceRuleGroup,
  AudienceValue,
  SurveyCandidate,
} from "./types";

function isArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function equalValues(actual: unknown, expected: unknown): boolean {
  if (isArray(actual) && isArray(expected)) {
    return actual.length === expected.length && actual.every((item) => expected.includes(item));
  }
  return actual === expected;
}

function contains(actual: unknown, expected: unknown): boolean {
  if (isArray(actual)) {
    return isArray(expected)
      ? expected.every((item) => actual.includes(item))
      : actual.includes(expected);
  }
  if (typeof actual === "string" && typeof expected === "string") {
    return actual.includes(expected);
  }
  return false;
}

function compareNumbers(
  actual: unknown,
  expected: unknown,
  comparator: (left: number, right: number) => boolean,
): boolean {
  return typeof actual === "number" && typeof expected === "number"
    ? comparator(actual, expected)
    : false;
}

function contextValue(context: AudienceContext, rule: AudienceRule): AudienceValue | undefined {
  return context[rule.field] as AudienceValue | undefined;
}

export function evaluateAudienceRule(
  rule: AudienceRule,
  context: AudienceContext,
): boolean {
  const actual = contextValue(context, rule);
  const expected = rule.value;

  switch (rule.operator) {
    case "exists":
      return actual !== undefined && actual !== null && actual !== "";
    case "not_exists":
      return actual === undefined || actual === null || actual === "";
    case "equals":
      return equalValues(actual, expected);
    case "not_equals":
      return !equalValues(actual, expected);
    case "contains":
      return contains(actual, expected);
    case "not_contains":
      return !contains(actual, expected);
    case "in":
      return isArray(expected) && typeof actual === "string"
        ? expected.includes(actual)
        : false;
    case "not_in":
      return isArray(expected) && typeof actual === "string"
        ? !expected.includes(actual)
        : true;
    case "greater_than":
      return compareNumbers(actual, expected, (left, right) => left > right);
    case "greater_than_or_equal":
      return compareNumbers(actual, expected, (left, right) => left >= right);
    case "less_than":
      return compareNumbers(actual, expected, (left, right) => left < right);
    case "less_than_or_equal":
      return compareNumbers(actual, expected, (left, right) => left <= right);
  }
}

export function evaluateAudience(
  group: AudienceRuleGroup | undefined,
  context: AudienceContext,
): boolean {
  if (!group) return true;
  if (group.mode === "all") {
    return group.rules.every((rule) => evaluateAudienceRule(rule, context));
  }
  return group.rules.some((rule) => evaluateAudienceRule(rule, context));
}

/** FNV-1a gives a stable rollout bucket without persisting visitor identifiers. */
export function stableSampleBucket(sampleKey: string, surveyId: string): number {
  const input = `${surveyId}:${sampleKey}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

export function isSurveyCandidateEligible<T>(
  candidate: SurveyCandidate<T>,
  context: AudienceContext,
  options: { now?: Date; sampleKey?: string } = {},
): boolean {
  if (candidate.status !== "active") return false;

  const now = options.now ?? new Date();
  if (candidate.startsAt && now < new Date(candidate.startsAt)) return false;
  if (candidate.endsAt && now >= new Date(candidate.endsAt)) return false;
  if (!evaluateAudience(candidate.audience, context)) return false;

  const percentage = Math.min(100, Math.max(0, candidate.samplePercentage ?? 100));
  if (percentage === 100) return true;
  if (percentage === 0 || !options.sampleKey) return false;
  return stableSampleBucket(options.sampleKey, candidate.surveyId) < percentage;
}

export function selectHighestPrioritySurvey<T>(
  candidates: readonly SurveyCandidate<T>[],
  context: AudienceContext,
  options: { now?: Date; sampleKey?: string } = {},
): SurveyCandidate<T> | null {
  const eligible = candidates.filter((candidate) =>
    isSurveyCandidateEligible(candidate, context, options),
  );

  eligible.sort(
    (left, right) => right.priority - left.priority || left.surveyId.localeCompare(right.surveyId),
  );
  return eligible[0] ?? null;
}
