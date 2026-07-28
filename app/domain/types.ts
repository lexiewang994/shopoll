export const SURVEY_SCHEMA_VERSION = 1 as const;

export const SURVEY_LOCALES = ["en", "de", "es"] as const;

export type SurveyLocale = (typeof SURVEY_LOCALES)[number];

/** Drafts may be incomplete. Publication validation enforces every enabled locale. */
export type LocalizedText = Partial<Record<SurveyLocale, string>>;

export type QuestionKind =
  | "single_choice"
  | "multiple_choice"
  | "short_text"
  | "long_text"
  | "nps"
  | "csat"
  | "star_rating"
  | "contact"
  | "consent"
  | "welcome"
  | "end";

export type AnswerScalar = string | number | boolean;

export interface ContactAnswer {
  email?: string;
  phone?: string;
  consent?: boolean;
}

export type AnswerValue = AnswerScalar | readonly string[] | ContactAnswer;

export type AnswerMap = Readonly<Record<string, AnswerValue | undefined>>;

export type AnswerConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal"
  | "is_answered"
  | "is_not_answered";

export interface AnswerCondition {
  questionId: string;
  operator: AnswerConditionOperator;
  value?: AnswerScalar | readonly string[];
}

export interface AnswerConditionGroup {
  mode: "all" | "any";
  conditions: readonly AnswerCondition[];
}

interface BaseQuestionV1 {
  id: string;
  kind: QuestionKind;
  title: LocalizedText;
  description?: LocalizedText;
  required?: boolean;
  visibleWhen?: AnswerConditionGroup;
}

export interface ChoiceOptionV1 {
  id: string;
  label: LocalizedText;
}

export interface SingleChoiceQuestionV1 extends BaseQuestionV1 {
  kind: "single_choice";
  options: readonly ChoiceOptionV1[];
  allowOther?: boolean;
}

export interface MultipleChoiceQuestionV1 extends BaseQuestionV1 {
  kind: "multiple_choice";
  options: readonly ChoiceOptionV1[];
  allowOther?: boolean;
  minSelections?: number;
  maxSelections?: number;
}

export interface ShortTextQuestionV1 extends BaseQuestionV1 {
  kind: "short_text";
  minLength?: number;
  maxLength?: number;
  placeholder?: LocalizedText;
}

export interface LongTextQuestionV1 extends BaseQuestionV1 {
  kind: "long_text";
  minLength?: number;
  maxLength?: number;
  placeholder?: LocalizedText;
}

export interface NpsQuestionV1 extends BaseQuestionV1 {
  kind: "nps";
  lowLabel?: LocalizedText;
  highLabel?: LocalizedText;
}

export interface CsatQuestionV1 extends BaseQuestionV1 {
  kind: "csat";
  scale: 5 | 7;
  lowLabel?: LocalizedText;
  highLabel?: LocalizedText;
}

export interface StarRatingQuestionV1 extends BaseQuestionV1 {
  kind: "star_rating";
  stars: 5 | 10;
}

export interface ContactQuestionV1 extends BaseQuestionV1 {
  kind: "contact";
  collect: readonly ("email" | "phone")[];
  consentText: LocalizedText;
}

export interface ConsentQuestionV1 extends BaseQuestionV1 {
  kind: "consent";
  required: boolean;
}

export interface WelcomeQuestionV1 extends BaseQuestionV1 {
  kind: "welcome";
  buttonLabel?: LocalizedText;
}

export interface EndQuestionV1 extends BaseQuestionV1 {
  kind: "end";
  buttonLabel?: LocalizedText;
  redirectUrl?: string;
}

export type SurveyQuestionV1 =
  | SingleChoiceQuestionV1
  | MultipleChoiceQuestionV1
  | ShortTextQuestionV1
  | LongTextQuestionV1
  | NpsQuestionV1
  | CsatQuestionV1
  | StarRatingQuestionV1
  | ContactQuestionV1
  | ConsentQuestionV1
  | WelcomeQuestionV1
  | EndQuestionV1;

export interface GoToQuestionAction {
  type: "go_to";
  questionId: string;
}

export interface CompleteSurveyAction {
  type: "complete";
}

export type NavigationAction = GoToQuestionAction | CompleteSurveyAction;

/** Rules are evaluated in array order. A rule without `when` is the fallback. */
export interface NavigationRuleV1 {
  id: string;
  fromQuestionId: string;
  when?: AnswerConditionGroup;
  action: NavigationAction;
}

export type SurveyTemplateCategory =
  | "purchase_motivation"
  | "purchase_barrier"
  | "cart_exit"
  | "abandoned_cart"
  | "post_delivery_nps"
  | "product_satisfaction"
  | "standalone";

export interface SurveyDefinitionV1 {
  schemaVersion: typeof SURVEY_SCHEMA_VERSION;
  id: string;
  version: number;
  slug: string;
  internalName: string;
  category: SurveyTemplateCategory;
  defaultLocale: SurveyLocale;
  enabledLocales: readonly SurveyLocale[];
  title: LocalizedText;
  description?: LocalizedText;
  questions: readonly SurveyQuestionV1[];
  navigation?: readonly NavigationRuleV1[];
  metadata?: Readonly<Record<string, string | number | boolean | readonly string[]>>;
}

export interface AnswerUpsert {
  schemaVersion: typeof SURVEY_SCHEMA_VERSION;
  sessionId: string;
  questionId: string;
  value: AnswerValue;
  idempotencyKey: string;
  answeredAt?: string;
}

export interface StoredAnswerV1 {
  schemaVersion: typeof SURVEY_SCHEMA_VERSION;
  sessionId: string;
  questionId: string;
  value: AnswerValue;
  idempotencyKey: string;
  answeredAt: string;
  questionSnapshot: SurveyQuestionV1;
}

export type AudienceField =
  | "surface"
  | "placementKey"
  | "pageType"
  | "path"
  | "productId"
  | "variantId"
  | "collectionIds"
  | "cartProductIds"
  | "orderProductIds"
  | "orderVariantIds"
  | "orderAmount"
  | "market"
  | "locale"
  | "customerType"
  | "discountCodes"
  | "source"
  | "utmSource"
  | "utmMedium"
  | "utmCampaign"
  | "purchaseCount"
  | "device"
  | "country"
  | "elapsedSeconds"
  | "scrollPercent"
  | "event";

export type AudienceValue = string | number | boolean | readonly string[];

export interface AudienceContext {
  surface?:
    | "theme_inline"
    | "theme_popup"
    | "thank_you"
    | "order_status"
    | "standalone"
    | "klaviyo";
  placementKey?: string;
  pageType?: string;
  path?: string;
  productId?: string;
  variantId?: string;
  collectionIds?: readonly string[];
  cartProductIds?: readonly string[];
  orderProductIds?: readonly string[];
  orderVariantIds?: readonly string[];
  orderAmount?: number;
  market?: string;
  locale?: string;
  customerType?: "new" | "returning";
  discountCodes?: readonly string[];
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  purchaseCount?: number;
  device?: "desktop" | "mobile" | "tablet";
  country?: string;
  elapsedSeconds?: number;
  scrollPercent?: number;
  event?: string;
  analyticsConsent?: boolean;
}

export type AudienceOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "in"
  | "not_in"
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal"
  | "exists"
  | "not_exists";

export interface AudienceRule {
  id: string;
  field: AudienceField;
  operator: AudienceOperator;
  value?: AudienceValue;
}

/** Audience groups intentionally contain rules only; nested groups are not supported in V1. */
export interface AudienceRuleGroup {
  mode: "all" | "any";
  rules: readonly AudienceRule[];
}

export interface SurveyCandidate<T = SurveyDefinitionV1> {
  surveyId: string;
  priority: number;
  status: "active" | "paused" | "draft";
  audience?: AudienceRuleGroup;
  startsAt?: string;
  endsAt?: string;
  samplePercentage?: number;
  value: T;
}

export interface AnswerValidationIssue {
  code:
    | "invalid_session"
    | "invalid_idempotency_key"
    | "invalid_timestamp"
    | "unknown_question"
    | "not_answerable"
    | "required"
    | "invalid_type"
    | "invalid_option"
    | "out_of_range"
    | "too_short"
    | "too_long"
    | "invalid_email"
    | "invalid_phone"
    | "missing_contact_consent";
  message: string;
}

export interface AnswerValidationResult {
  valid: boolean;
  issues: readonly AnswerValidationIssue[];
}

export interface DefinitionValidationIssue {
  code:
    | "missing_locale"
    | "missing_translation"
    | "duplicate_question_id"
    | "duplicate_option_id"
    | "duplicate_rule_id"
    | "invalid_reference"
    | "invalid_rule_order"
    | "empty_condition_group"
    | "cycle"
    | "unreachable_question"
    | "invalid_question_config";
  path: string;
  message: string;
}

export interface DefinitionValidationResult {
  valid: boolean;
  issues: readonly DefinitionValidationIssue[];
}

export interface AnalyticsAnswer {
  questionId: string;
  value: AnswerValue;
}

export interface AnalyticsSession {
  id: string;
  startedAt: string;
  completedAt?: string;
  answers: readonly AnalyticsAnswer[];
  orderRevenue?: number;
}

/** Stable filter contract shared by dashboards, CSV exports and weekly reports. */
export interface AnalyticsFilter {
  schemaVersion: typeof SURVEY_SCHEMA_VERSION;
  surveyId?: string;
  productGid?: string;
  variantGid?: string;
  market?: string;
  locale?: string;
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  customerType?: "new" | "returning";
  dateFrom?: string;
  dateTo?: string;
}

export interface AnalyticsSummary {
  impressions: number;
  starts: number;
  partials: number;
  completions: number;
  startRate: number;
  completionRate: number;
  averageCompletionSeconds: number | null;
  nps: number | null;
  csat: number | null;
  attributedOrders: number;
  attributedRevenue: number;
  attributedAov: number | null;
}

export interface WeeklyMetricSnapshot {
  impressions: number;
  starts: number;
  completions: number;
  completionRate: number;
  nps: number | null;
  csat: number | null;
  attributedOrders: number;
  attributedRevenue: number;
}

export interface MetricComparison {
  current: number | null;
  previous: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
}

export type WeeklyComparison = {
  [K in keyof WeeklyMetricSnapshot]: MetricComparison;
};
