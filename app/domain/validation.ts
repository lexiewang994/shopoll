import type {
  AnswerConditionGroup,
  DefinitionValidationIssue,
  DefinitionValidationResult,
  LocalizedText,
  NavigationRuleV1,
  SurveyDefinitionV1,
  SurveyLocale,
  SurveyQuestionV1,
} from "./types";

const ANSWERABLE_KINDS = new Set<SurveyQuestionV1["kind"]>([
  "single_choice",
  "multiple_choice",
  "short_text",
  "long_text",
  "nps",
  "csat",
  "star_rating",
  "contact",
  "consent",
]);

function addMissingTranslations(
  issues: DefinitionValidationIssue[],
  text: LocalizedText | undefined,
  locales: readonly SurveyLocale[],
  path: string,
) {
  if (!text) return;

  for (const locale of locales) {
    if (!text[locale]?.trim()) {
      issues.push({
        code: "missing_translation",
        path: `${path}.${locale}`,
        message: `Missing ${locale} translation`,
      });
    }
  }
}

function validateConditionGroup(
  group: AnswerConditionGroup | undefined,
  path: string,
  questionIds: ReadonlySet<string>,
  answerableIds: ReadonlySet<string>,
  issues: DefinitionValidationIssue[],
) {
  if (!group) return;

  if (group.conditions.length === 0) {
    issues.push({
      code: "empty_condition_group",
      path,
      message: "A condition group must contain at least one condition",
    });
  }

  group.conditions.forEach((condition, index) => {
    const conditionPath = `${path}.conditions[${index}].questionId`;
    if (!questionIds.has(condition.questionId)) {
      issues.push({
        code: "invalid_reference",
        path: conditionPath,
        message: `Unknown question '${condition.questionId}'`,
      });
    } else if (!answerableIds.has(condition.questionId)) {
      issues.push({
        code: "invalid_reference",
        path: conditionPath,
        message: `Conditions cannot reference non-answerable question '${condition.questionId}'`,
      });
    }

    const needsValue = !["is_answered", "is_not_answered"].includes(
      condition.operator,
    );
    if (needsValue && condition.value === undefined) {
      issues.push({
        code: "invalid_question_config",
        path: `${path}.conditions[${index}].value`,
        message: `Operator '${condition.operator}' requires a value`,
      });
    }
  });
}

function validateQuestionConfig(
  question: SurveyQuestionV1,
  index: number,
  issues: DefinitionValidationIssue[],
) {
  const path = `questions[${index}]`;

  if (question.kind === "single_choice" || question.kind === "multiple_choice") {
    if (question.options.length === 0) {
      issues.push({
        code: "invalid_question_config",
        path: `${path}.options`,
        message: "Choice questions need at least one option",
      });
    }

    const optionIds = new Set<string>();
    question.options.forEach((option, optionIndex) => {
      if (optionIds.has(option.id)) {
        issues.push({
          code: "duplicate_option_id",
          path: `${path}.options[${optionIndex}].id`,
          message: `Duplicate option id '${option.id}'`,
        });
      }
      optionIds.add(option.id);
    });
  }

  if (question.kind === "multiple_choice") {
    const min = question.minSelections ?? 0;
    const max = question.maxSelections ?? question.options.length;
    if (min < 0 || max < 1 || min > max || max > question.options.length) {
      issues.push({
        code: "invalid_question_config",
        path,
        message: "Multiple-choice selection limits are inconsistent",
      });
    }
  }

  if (question.kind === "short_text" || question.kind === "long_text") {
    const min = question.minLength ?? 0;
    const max = question.maxLength ?? Number.MAX_SAFE_INTEGER;
    if (min < 0 || max < 1 || min > max) {
      issues.push({
        code: "invalid_question_config",
        path,
        message: "Text length limits are inconsistent",
      });
    }
  }

  if (question.kind === "contact") {
    if (question.collect.length === 0 || new Set(question.collect).size !== question.collect.length) {
      issues.push({
        code: "invalid_question_config",
        path: `${path}.collect`,
        message: "Contact questions must collect one or more unique fields",
      });
    }
  }
}

function questionTranslationFields(question: SurveyQuestionV1) {
  const fields: [string, LocalizedText | undefined][] = [
    ["title", question.title],
    ["description", question.description],
  ];

  if (question.kind === "single_choice" || question.kind === "multiple_choice") {
    question.options.forEach((option, index) => {
      fields.push([`options[${index}].label`, option.label]);
    });
  }
  if (question.kind === "short_text" || question.kind === "long_text") {
    fields.push(["placeholder", question.placeholder]);
  }
  if (question.kind === "nps" || question.kind === "csat") {
    fields.push(["lowLabel", question.lowLabel], ["highLabel", question.highLabel]);
  }
  if (question.kind === "contact") {
    fields.push(["consentText", question.consentText]);
  }
  if (question.kind === "welcome" || question.kind === "end") {
    fields.push(["buttonLabel", question.buttonLabel]);
  }

  return fields;
}

function navigationEdges(
  definition: SurveyDefinitionV1,
): ReadonlyMap<string, ReadonlySet<string>> {
  const edges = new Map<string, Set<string>>();
  const rulesBySource = new Map<string, NavigationRuleV1[]>();

  for (const question of definition.questions) edges.set(question.id, new Set());
  for (const rule of definition.navigation ?? []) {
    const rules = rulesBySource.get(rule.fromQuestionId) ?? [];
    rules.push(rule);
    rulesBySource.set(rule.fromQuestionId, rules);
    if (rule.action.type === "go_to" && edges.has(rule.fromQuestionId)) {
      edges.get(rule.fromQuestionId)?.add(rule.action.questionId);
    }
  }

  definition.questions.forEach((question, index) => {
    if (question.kind === "end") return;
    const rules = rulesBySource.get(question.id) ?? [];
    const hasFallback = rules.some((rule) => !rule.when);
    const next = definition.questions[index + 1];
    if (!hasFallback && next) edges.get(question.id)?.add(next.id);
  });

  return edges;
}

function findCycles(edges: ReadonlyMap<string, ReadonlySet<string>>): readonly string[][] {
  const state = new Map<string, "visiting" | "visited">();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const signatures = new Set<string>();

  const visit = (node: string) => {
    if (state.get(node) === "visited") return;
    if (state.get(node) === "visiting") {
      const start = stack.indexOf(node);
      const cycle = [...stack.slice(start), node];
      const signature = [...new Set(cycle)].sort().join("|");
      if (!signatures.has(signature)) {
        signatures.add(signature);
        cycles.push(cycle);
      }
      return;
    }

    state.set(node, "visiting");
    stack.push(node);
    for (const target of edges.get(node) ?? []) {
      if (edges.has(target)) visit(target);
    }
    stack.pop();
    state.set(node, "visited");
  };

  for (const node of edges.keys()) visit(node);
  return cycles;
}

function conditionDependencyEdges(
  definition: SurveyDefinitionV1,
): ReadonlyMap<string, ReadonlySet<string>> {
  const edges = new Map<string, Set<string>>();
  for (const question of definition.questions) edges.set(question.id, new Set());

  for (const question of definition.questions) {
    for (const condition of question.visibleWhen?.conditions ?? []) {
      if (edges.has(condition.questionId)) edges.get(question.id)?.add(condition.questionId);
    }
  }
  for (const rule of definition.navigation ?? []) {
    for (const condition of rule.when?.conditions ?? []) {
      if (edges.has(rule.fromQuestionId) && edges.has(condition.questionId)) {
        edges.get(rule.fromQuestionId)?.add(condition.questionId);
      }
    }
  }

  return edges;
}

export function validateSurveyDefinition(
  definition: SurveyDefinitionV1,
): DefinitionValidationResult {
  const issues: DefinitionValidationIssue[] = [];
  const questionIds = new Set<string>();
  const answerableIds = new Set<string>();

  if (!definition.enabledLocales.includes(definition.defaultLocale)) {
    issues.push({
      code: "missing_locale",
      path: "defaultLocale",
      message: "The default locale must be enabled",
    });
  }
  if (!definition.enabledLocales.includes("en")) {
    issues.push({
      code: "missing_locale",
      path: "enabledLocales",
      message: "English must be enabled as the fallback locale",
    });
  }
  if (new Set(definition.enabledLocales).size !== definition.enabledLocales.length) {
    issues.push({
      code: "missing_locale",
      path: "enabledLocales",
      message: "Enabled locales must be unique",
    });
  }
  if (definition.questions.length === 0) {
    issues.push({
      code: "invalid_question_config",
      path: "questions",
      message: "A survey needs at least one question or content screen",
    });
  }

  definition.questions.forEach((question, index) => {
    if (questionIds.has(question.id)) {
      issues.push({
        code: "duplicate_question_id",
        path: `questions[${index}].id`,
        message: `Duplicate question id '${question.id}'`,
      });
    }
    questionIds.add(question.id);
    if (ANSWERABLE_KINDS.has(question.kind)) answerableIds.add(question.id);
  });

  addMissingTranslations(issues, definition.title, definition.enabledLocales, "title");
  addMissingTranslations(
    issues,
    definition.description,
    definition.enabledLocales,
    "description",
  );

  definition.questions.forEach((question, index) => {
    validateQuestionConfig(question, index, issues);
    for (const [field, text] of questionTranslationFields(question)) {
      addMissingTranslations(
        issues,
        text,
        definition.enabledLocales,
        `questions[${index}].${field}`,
      );
    }
    validateConditionGroup(
      question.visibleWhen,
      `questions[${index}].visibleWhen`,
      questionIds,
      answerableIds,
      issues,
    );
  });

  const ruleIds = new Set<string>();
  const sawFallback = new Set<string>();
  (definition.navigation ?? []).forEach((rule, index) => {
    const path = `navigation[${index}]`;
    if (ruleIds.has(rule.id)) {
      issues.push({
        code: "duplicate_rule_id",
        path: `${path}.id`,
        message: `Duplicate navigation rule id '${rule.id}'`,
      });
    }
    ruleIds.add(rule.id);

    if (!questionIds.has(rule.fromQuestionId)) {
      issues.push({
        code: "invalid_reference",
        path: `${path}.fromQuestionId`,
        message: `Unknown source question '${rule.fromQuestionId}'`,
      });
    }
    const sourceQuestion = definition.questions.find(
      (question) => question.id === rule.fromQuestionId,
    );
    if (sourceQuestion?.kind === "end") {
      issues.push({
        code: "invalid_question_config",
        path: `${path}.fromQuestionId`,
        message: "End screens cannot have outgoing navigation",
      });
    }
    if (rule.action.type === "go_to" && !questionIds.has(rule.action.questionId)) {
      issues.push({
        code: "invalid_reference",
        path: `${path}.action.questionId`,
        message: `Unknown target question '${rule.action.questionId}'`,
      });
    }
    if (sawFallback.has(rule.fromQuestionId)) {
      issues.push({
        code: "invalid_rule_order",
        path,
        message: "No rule may follow an unconditional fallback for the same question",
      });
    }
    if (!rule.when) sawFallback.add(rule.fromQuestionId);

    validateConditionGroup(
      rule.when,
      `${path}.when`,
      questionIds,
      answerableIds,
      issues,
    );
  });

  const navEdges = navigationEdges(definition);
  for (const cycle of findCycles(navEdges)) {
    issues.push({
      code: "cycle",
      path: "navigation",
      message: `Navigation cycle detected: ${cycle.join(" -> ")}`,
    });
  }

  for (const cycle of findCycles(conditionDependencyEdges(definition))) {
    issues.push({
      code: "cycle",
      path: "conditions",
      message: `Condition dependency cycle detected: ${cycle.join(" -> ")}`,
    });
  }

  const firstQuestion = definition.questions[0];
  const reachable = new Set<string>();
  const visit = (questionId: string) => {
    if (reachable.has(questionId)) return;
    reachable.add(questionId);
    for (const target of navEdges.get(questionId) ?? []) visit(target);
  };
  if (firstQuestion) visit(firstQuestion.id);

  definition.questions.forEach((question, index) => {
    if (!reachable.has(question.id)) {
      issues.push({
        code: "unreachable_question",
        path: `questions[${index}]`,
        message: `Question '${question.id}' cannot be reached from the start`,
      });
    }
  });

  return { valid: issues.length === 0, issues };
}

export function assertPublishableSurveyDefinition(
  definition: SurveyDefinitionV1,
): void {
  const result = validateSurveyDefinition(definition);
  if (!result.valid) {
    const details = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new Error(`Survey definition is not publishable: ${details}`);
  }
}
