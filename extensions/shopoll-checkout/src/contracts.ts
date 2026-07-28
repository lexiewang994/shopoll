export type LocalizedText = string | Record<string, string>;

export type QuestionType =
  | "single_choice"
  | "multiple_choice"
  | "short_text"
  | "long_text"
  | "nps"
  | "csat"
  | "rating"
  | "contact"
  | "consent"
  | "welcome"
  | "end";

export interface SurveyOption {
  id?: string;
  value?: string | number;
  label?: LocalizedText;
  text?: LocalizedText;
  title?: LocalizedText;
}

export interface SurveyRule {
  operator?: string;
  comparator?: string;
  value?: unknown;
  action?: string;
  type?: string;
  target?: string;
  targetQuestionId?: string;
  target_question_id?: string;
  goTo?: string;
  condition?: SurveyRule;
  when?: SurveyRule;
}

export interface SurveyQuestion {
  id: string;
  type: string;
  title?: LocalizedText;
  prompt?: LocalizedText;
  description?: LocalizedText;
  helpText?: LocalizedText;
  consentText?: LocalizedText;
  contactKind?: "email" | "phone";
  collect?: Array<"email" | "phone">;
  placeholder?: LocalizedText;
  lowLabel?: LocalizedText;
  highLabel?: LocalizedText;
  buttonLabel?: LocalizedText;
  required?: boolean;
  isFinal?: boolean;
  maxLength?: number;
  max_length?: number;
  scale?: 5 | 7;
  stars?: 5 | 10;
  options?: SurveyOption[];
  logic?: SurveyRule[] | {rules?: SurveyRule[]};
  rules?: SurveyRule[];
  next?: string;
  nextQuestionId?: string;
  next_question_id?: string;
}

export interface SurveyDefinitionV1 {
  schemaVersion?: 1;
  surveyId?: string;
  versionId?: string;
  title?: LocalizedText;
  description?: LocalizedText;
  eyebrow?: LocalizedText;
  startQuestionId?: string;
  start_question_id?: string;
  questions?: SurveyQuestion[];
  nodes?: SurveyQuestion[];
  completion?: {title?: LocalizedText; message?: LocalizedText};
  thankYouTitle?: LocalizedText;
  thankYouMessage?: LocalizedText;
}

export interface SurveyEnvelope {
  id?: string;
  title?: LocalizedText;
  versionId?: string;
  surveyVersionId?: string;
  definition?: SurveyDefinitionV1;
  definitionJson?: SurveyDefinitionV1;
  questions?: SurveyQuestion[];
}

export interface PlacementEnvelope {
  id?: string;
  key?: string;
}

export interface ResponseSession {
  id?: string;
  sessionId?: string;
  resumeToken?: string;
  answers?: Array<{questionId: string; value: unknown}>;
}

export interface ResolveResponse {
  eligible?: boolean;
  retryAfterMs?: number;
  reason?: string;
  survey?: SurveyEnvelope;
  placement?: PlacementEnvelope;
  session?: ResponseSession;
}

export interface AudienceContext {
  surface: "thank_you" | "order_status";
  placementKey: string;
  orderGid: string;
  orderConfirmationNumber: string;
  locale: string;
  country?: string;
}

export interface NavigationDirective {
  complete?: boolean;
  nextQuestionId?: string;
}

export interface CompleteResponse {
  completion?: {title?: LocalizedText; message?: LocalizedText};
  reward?: {status?: string; code?: string; expiresAt?: string};
}

export function unwrap<T>(payload: T | {data: T}): T {
  if (payload && typeof payload === "object" && "data" in payload) return payload.data;
  return payload as T;
}

export function questionType(type: string): QuestionType {
  const normalized = String(type || "").toLowerCase().replace(/[-\s]/g, "_");
  const aliases: Record<string, QuestionType> = {
    single: "single_choice",
    radio: "single_choice",
    choice: "single_choice",
    multi: "multiple_choice",
    multiple: "multiple_choice",
    checkbox: "multiple_choice",
    short: "short_text",
    text: "short_text",
    long: "long_text",
    textarea: "long_text",
    stars: "rating",
    welcome_page: "welcome",
    end_page: "end",
    thank_you: "end",
  };
  return aliases[normalized] ?? (normalized as QuestionType);
}

export function localized(value: LocalizedText | undefined, locale: string): string {
  if (typeof value === "string") return value;
  if (!value) return "";
  const shortLocale = locale.split("-")[0];
  return value[locale] ?? value[shortLocale] ?? value.en ?? value.default ?? "";
}

export function matchesCondition(condition: SurveyRule, value: unknown): boolean {
  const operator = String(condition.operator ?? condition.comparator ?? "equals").toLowerCase();
  const expected = condition.value;
  if (operator === "equals" || operator === "is") return value === expected;
  if (operator === "not_equals" || operator === "is_not") return value !== expected;
  if (operator === "includes" || operator === "contains") {
    return Array.isArray(value)
      ? value.includes(expected)
      : String(value ?? "").includes(String(expected));
  }
  if (operator === "not_includes") {
    return !matchesCondition({...condition, operator: "includes"}, value);
  }
  if (operator === "answered") return value !== undefined && value !== null && value !== "";
  if (operator === "greater_than") return Number(value) > Number(expected);
  if (operator === "less_than") return Number(value) < Number(expected);
  return false;
}

export function nextQuestion(
  question: SurveyQuestion,
  answer: unknown,
  questions: SurveyQuestion[],
): NavigationDirective {
  const logic = Array.isArray(question.logic) ? question.logic : question.logic?.rules;
  const rules = logic ?? question.rules ?? [];
  for (const rule of rules) {
    const condition = rule.condition ?? rule.when ?? rule;
    if (!matchesCondition(condition, answer)) continue;
    const action = String(rule.action ?? rule.type ?? "go_to").toLowerCase();
    if (["complete", "end", "end_survey"].includes(action)) return {complete: true};
    const target = rule.targetQuestionId ?? rule.target_question_id ?? rule.target ?? rule.goTo;
    if (target) return {nextQuestionId: String(target)};
  }
  const explicit = question.nextQuestionId ?? question.next_question_id ?? question.next;
  if (explicit === "complete" || explicit === "end") return {complete: true};
  if (explicit) return {nextQuestionId: explicit};
  const currentIndex = questions.indexOf(question);
  if (currentIndex < 0 || currentIndex >= questions.length - 1) return {complete: true};
  return {nextQuestionId: questions[currentIndex + 1].id};
}

export function stableHash(value: unknown): string {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  const input = serialized === undefined ? String(value) : serialized;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function isAnswered(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object" && "value" in value) {
    return Boolean((value as {value?: unknown}).value);
  }
  if (value && typeof value === "object") {
    const contact = value as {email?: unknown; phone?: unknown};
    return Boolean(contact.email || contact.phone);
  }
  return value !== undefined && value !== null && String(value).trim() !== "";
}
