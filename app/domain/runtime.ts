import type {
  AnswerCondition,
  AnswerConditionGroup,
  AnswerMap,
  AnswerUpsert,
  AnswerValidationIssue,
  AnswerValidationResult,
  AnswerValue,
  ContactAnswer,
  StoredAnswerV1,
  SurveyDefinitionV1,
  SurveyQuestionV1,
} from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{5,24}$/;

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isContactAnswer(value: AnswerValue): value is ContactAnswer {
  return typeof value === "object" && !Array.isArray(value);
}

export function hasAnswer(value: AnswerValue | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (isStringArray(value)) return value.length > 0;
  if (isContactAnswer(value)) {
    return Boolean(value.email?.trim() || value.phone?.trim());
  }
  return true;
}

function valuesEqual(actual: AnswerValue | undefined, expected: unknown): boolean {
  if (isStringArray(actual) && Array.isArray(expected)) {
    return actual.length === expected.length && actual.every((value) => expected.includes(value));
  }
  return actual === expected;
}

export function evaluateAnswerCondition(
  condition: AnswerCondition,
  answers: AnswerMap,
): boolean {
  const actual = answers[condition.questionId];

  switch (condition.operator) {
    case "is_answered":
      return hasAnswer(actual);
    case "is_not_answered":
      return !hasAnswer(actual);
    case "equals":
      return valuesEqual(actual, condition.value);
    case "not_equals":
      return !valuesEqual(actual, condition.value);
    case "contains":
      if (Array.isArray(actual)) {
        return Array.isArray(condition.value)
          ? condition.value.every((value) => actual.includes(String(value)))
          : actual.includes(String(condition.value));
      }
      return typeof actual === "string" && typeof condition.value === "string"
        ? actual.includes(condition.value)
        : false;
    case "not_contains":
      return !evaluateAnswerCondition({ ...condition, operator: "contains" }, answers);
    case "greater_than":
      return typeof actual === "number" && typeof condition.value === "number"
        ? actual > condition.value
        : false;
    case "greater_than_or_equal":
      return typeof actual === "number" && typeof condition.value === "number"
        ? actual >= condition.value
        : false;
    case "less_than":
      return typeof actual === "number" && typeof condition.value === "number"
        ? actual < condition.value
        : false;
    case "less_than_or_equal":
      return typeof actual === "number" && typeof condition.value === "number"
        ? actual <= condition.value
        : false;
  }
}

export function evaluateAnswerConditionGroup(
  group: AnswerConditionGroup | undefined,
  answers: AnswerMap,
): boolean {
  if (!group) return true;
  if (group.mode === "all") {
    return group.conditions.every((condition) => evaluateAnswerCondition(condition, answers));
  }
  return group.conditions.some((condition) => evaluateAnswerCondition(condition, answers));
}

export function isQuestionVisible(question: SurveyQuestionV1, answers: AnswerMap): boolean {
  return evaluateAnswerConditionGroup(question.visibleWhen, answers);
}

export function getVisibleQuestions(
  definition: SurveyDefinitionV1,
  answers: AnswerMap,
): readonly SurveyQuestionV1[] {
  return definition.questions.filter((question) => isQuestionVisible(question, answers));
}

function nextQuestionId(
  definition: SurveyDefinitionV1,
  currentQuestionId: string,
  answers: AnswerMap,
): string | null {
  const currentQuestion = definition.questions.find(
    (question) => question.id === currentQuestionId,
  );
  if (!currentQuestion || currentQuestion.kind === "end") return null;

  const rules = (definition.navigation ?? []).filter(
    (rule) => rule.fromQuestionId === currentQuestionId,
  );
  const matchingRule = rules.find((rule) =>
    evaluateAnswerConditionGroup(rule.when, answers),
  );
  if (matchingRule) {
    return matchingRule.action.type === "complete" ? null : matchingRule.action.questionId;
  }

  const currentIndex = definition.questions.findIndex(
    (question) => question.id === currentQuestionId,
  );
  return definition.questions[currentIndex + 1]?.id ?? null;
}

/**
 * Returns the navigable visible path after `currentQuestionId`. Pass null to begin
 * at the start. Hidden questions are traversed but not returned.
 */
export function computeNextVisibleQuestions(
  definition: SurveyDefinitionV1,
  currentQuestionId: string | null,
  answers: AnswerMap,
): readonly SurveyQuestionV1[] {
  const questionsById = new Map(
    definition.questions.map((question) => [question.id, question] as const),
  );
  let candidateId = currentQuestionId
    ? nextQuestionId(definition, currentQuestionId, answers)
    : definition.questions[0]?.id ?? null;
  const visited = new Set<string>();
  const path: SurveyQuestionV1[] = [];

  while (candidateId && !visited.has(candidateId)) {
    visited.add(candidateId);
    const question = questionsById.get(candidateId);
    if (!question) break;
    if (isQuestionVisible(question, answers)) path.push(question);
    candidateId = nextQuestionId(definition, question.id, answers);
  }

  return path;
}

export function getNextVisibleQuestion(
  definition: SurveyDefinitionV1,
  currentQuestionId: string | null,
  answers: AnswerMap,
): SurveyQuestionV1 | null {
  return computeNextVisibleQuestions(definition, currentQuestionId, answers)[0] ?? null;
}

function issue(
  issues: AnswerValidationIssue[],
  code: AnswerValidationIssue["code"],
  message: string,
) {
  issues.push({ code, message });
}

export function validateAnswerUpsert(
  definition: SurveyDefinitionV1,
  input: AnswerUpsert,
): AnswerValidationResult {
  const issues: AnswerValidationIssue[] = [];
  if (!input.sessionId.trim()) issue(issues, "invalid_session", "Session id is required");
  if (!input.idempotencyKey.trim()) {
    issue(issues, "invalid_idempotency_key", "Idempotency key is required");
  }
  if (input.answeredAt && Number.isNaN(Date.parse(input.answeredAt))) {
    issue(issues, "invalid_timestamp", "answeredAt must be an ISO-compatible timestamp");
  }

  const question = definition.questions.find((item) => item.id === input.questionId);
  if (!question) {
    issue(issues, "unknown_question", `Unknown question '${input.questionId}'`);
    return { valid: false, issues };
  }
  if (question.kind === "welcome" || question.kind === "end") {
    issue(issues, "not_answerable", `Question '${input.questionId}' does not accept answers`);
    return { valid: false, issues };
  }

  const value = input.value;
  if (question.required && !hasAnswer(value)) {
    issue(issues, "required", "An answer is required");
    return { valid: false, issues };
  }

  if (question.kind === "single_choice") {
    if (typeof value !== "string") {
      issue(issues, "invalid_type", "Single-choice answers must be strings");
    } else if (
      !question.allowOther &&
      !question.options.some((option) => option.id === value)
    ) {
      issue(issues, "invalid_option", `Unknown option '${value}'`);
    }
  }

  if (question.kind === "multiple_choice") {
    if (!isStringArray(value)) {
      issue(issues, "invalid_type", "Multiple-choice answers must be string arrays");
    } else {
      const invalidValues = value.filter(
        (item) => !question.options.some((option) => option.id === item),
      );
      if (!question.allowOther && invalidValues.length > 0) {
        issue(issues, "invalid_option", `Unknown options: ${invalidValues.join(", ")}`);
      }
      const uniqueCount = new Set(value).size;
      if (
        uniqueCount !== value.length ||
        uniqueCount < (question.minSelections ?? 0) ||
        uniqueCount > (question.maxSelections ?? question.options.length)
      ) {
        issue(issues, "out_of_range", "Selection count is outside the allowed range");
      }
    }
  }

  if (question.kind === "short_text" || question.kind === "long_text") {
    if (typeof value !== "string") {
      issue(issues, "invalid_type", "Text answers must be strings");
    } else {
      if (value.length < (question.minLength ?? 0)) {
        issue(issues, "too_short", "Text answer is shorter than the minimum length");
      }
      if (value.length > (question.maxLength ?? Number.MAX_SAFE_INTEGER)) {
        issue(issues, "too_long", "Text answer is longer than the maximum length");
      }
    }
  }

  if (question.kind === "nps") {
    if (typeof value !== "number") {
      issue(issues, "invalid_type", "NPS answers must be numbers");
    } else if (!Number.isInteger(value) || value < 0 || value > 10) {
      issue(issues, "out_of_range", "NPS answers must be integers from 0 to 10");
    }
  }

  if (question.kind === "csat") {
    if (typeof value !== "number") {
      issue(issues, "invalid_type", "CSAT answers must be numbers");
    } else if (!Number.isInteger(value) || value < 1 || value > question.scale) {
      issue(issues, "out_of_range", `CSAT answers must be integers from 1 to ${question.scale}`);
    }
  }

  if (question.kind === "star_rating") {
    if (typeof value !== "number") {
      issue(issues, "invalid_type", "Star ratings must be numbers");
    } else if (!Number.isInteger(value) || value < 1 || value > question.stars) {
      issue(issues, "out_of_range", `Star ratings must be integers from 1 to ${question.stars}`);
    }
  }

  if (question.kind === "contact") {
    if (!isContactAnswer(value)) {
      issue(issues, "invalid_type", "Contact answers must be objects");
    } else {
      for (const field of question.collect) {
        if (question.required && !value[field]?.trim()) {
          issue(issues, "required", `${field} is required`);
        }
      }
      if (!question.collect.includes("email") && value.email) {
        issue(issues, "invalid_type", "Email was not requested by this question");
      }
      if (!question.collect.includes("phone") && value.phone) {
        issue(issues, "invalid_type", "Phone was not requested by this question");
      }
      if (question.collect.includes("email") && value.email && !EMAIL_PATTERN.test(value.email)) {
        issue(issues, "invalid_email", "Email address is invalid");
      }
      if (question.collect.includes("phone") && value.phone && !PHONE_PATTERN.test(value.phone)) {
        issue(issues, "invalid_phone", "Phone number is invalid");
      }
      if (value.consent !== true) {
        issue(issues, "missing_contact_consent", "Contact details require explicit consent");
      }
    }
  }

  if (question.kind === "consent" && typeof value !== "boolean") {
    issue(issues, "invalid_type", "Consent answers must be boolean");
  } else if (question.kind === "consent" && question.required && value !== true) {
    issue(issues, "required", "Required consent must be accepted");
  }

  return { valid: issues.length === 0, issues };
}

function answerValuesEqual(left: AnswerValue, right: AnswerValue): boolean {
  if (isStringArray(left) && isStringArray(right)) {
    return left.length === right.length && left.every((item, index) => item === right[index]);
  }
  if (isContactAnswer(left) && isContactAnswer(right)) {
    return left.email === right.email && left.phone === right.phone && left.consent === right.consent;
  }
  return left === right;
}

export class AnswerInputError extends Error {
  readonly issues: readonly AnswerValidationIssue[];

  constructor(issues: readonly AnswerValidationIssue[]) {
    super(issues.map((item) => item.message).join("; "));
    this.name = "AnswerInputError";
    this.issues = issues;
  }
}

export function upsertAnswer(
  definition: SurveyDefinitionV1,
  existing: readonly StoredAnswerV1[],
  input: AnswerUpsert,
  now: Date = new Date(),
): readonly StoredAnswerV1[] {
  const validation = validateAnswerUpsert(definition, input);
  if (!validation.valid) throw new AnswerInputError(validation.issues);

  const priorRequest = existing.find(
    (answer) =>
      answer.sessionId === input.sessionId && answer.idempotencyKey === input.idempotencyKey,
  );
  if (priorRequest) {
    if (
      priorRequest.questionId === input.questionId &&
      answerValuesEqual(priorRequest.value, input.value)
    ) {
      return existing;
    }
    throw new Error("Idempotency key was already used for a different answer");
  }

  const question = definition.questions.find((item) => item.id === input.questionId);
  if (!question) throw new Error(`Unknown question '${input.questionId}'`);
  const stored: StoredAnswerV1 = {
    schemaVersion: 1,
    sessionId: input.sessionId,
    questionId: input.questionId,
    value: structuredClone(input.value),
    idempotencyKey: input.idempotencyKey,
    answeredAt: input.answeredAt ?? now.toISOString(),
    questionSnapshot: structuredClone(question),
  };

  const withoutPrevious = existing.filter(
    (answer) =>
      answer.sessionId !== input.sessionId || answer.questionId !== input.questionId,
  );
  return [...withoutPrevious, stored];
}

export function answersToMap(answers: readonly StoredAnswerV1[]): AnswerMap {
  return Object.fromEntries(answers.map((answer) => [answer.questionId, answer.value]));
}
