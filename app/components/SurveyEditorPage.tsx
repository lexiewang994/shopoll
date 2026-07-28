import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import type {
  AnswerCondition,
  AnswerConditionGroup,
  AnswerConditionOperator,
  ChoiceOptionV1,
  LocalizedText,
  NavigationRuleV1,
  QuestionKind,
  SurveyDefinitionV1,
  SurveyLocale,
  SurveyQuestionV1,
} from "../domain";
import { validateSurveyDefinition } from "../domain";
import { useAdminI18n, type AdminLocale } from "./AdminI18n";
import {
  QUESTION_KIND_LABELS,
  TEMPLATE_OPTIONS,
  type QuestionDraft,
} from "./shopoll-data";
import { SurveyPreview } from "./SurveyPreview";
import {
  Field,
  Notice,
  PageHeader,
  Panel,
  Segmented,
  StatusBadge,
  Toggle,
} from "./ShopollUi";

type EditorTab =
  | "build"
  | "logic"
  | "audience"
  | "translations"
  | "style"
  | "reward"
  | "publish";
type PreviewDevice = "desktop" | "mobile";

export interface EditorPlacement {
  id: string;
  surface: string;
  enabled: boolean;
  priority: number;
  sampleRate: number;
  frequencyCapDays: number;
  startsAt?: string | null;
  endsAt?: string | null;
  maxResponses?: number | null;
  triggerConfig: unknown;
  styleConfig: unknown;
  audienceRules?: readonly {
    groupIndex: number;
    groupJoin: string;
    field: string;
    operator: string;
    value: unknown;
  }[];
}

export interface EditorVersion {
  id: string;
  version: number;
  publishedAt: string;
  checksum: string;
  releaseNote?: string | null;
  active: boolean;
}

type EditorAudienceRule = NonNullable<EditorPlacement["audienceRules"]>[number];

type SurveyEditorStatus = "DRAFT" | "PUBLISHED" | "PAUSED" | "ARCHIVED";

function localizedValue(
  text: LocalizedText | undefined,
  locale: SurveyLocale,
): string {
  return text?.[locale] ?? text?.en ?? text?.de ?? text?.es ?? "";
}

function directLocalizedValue(
  text: LocalizedText | undefined,
  locale: SurveyLocale,
): string {
  return text?.[locale] ?? "";
}

function withLocalizedValue(
  text: LocalizedText | undefined,
  locale: SurveyLocale,
  value: string,
): LocalizedText {
  return { ...(text ?? {}), [locale]: value };
}

function choiceOptions(question: SurveyQuestionV1): readonly ChoiceOptionV1[] {
  return question.kind === "single_choice" ||
    question.kind === "multiple_choice"
    ? (question.options ?? [])
    : [];
}

type QuestionLocalizedField =
  | "description"
  | "placeholder"
  | "lowLabel"
  | "highLabel"
  | "consentText"
  | "buttonLabel";

function questionTranslationEntries(question: SurveyQuestionV1): readonly {
  field: QuestionLocalizedField;
  label: string;
  text: LocalizedText;
}[] {
  const entries: {
    field: QuestionLocalizedField;
    label: string;
    text: LocalizedText;
  }[] = [];
  if (question.description) {
    entries.push({
      field: "description",
      label: "说明",
      text: question.description,
    });
  }
  if (
    (question.kind === "short_text" || question.kind === "long_text") &&
    question.placeholder
  ) {
    entries.push({
      field: "placeholder",
      label: "占位提示",
      text: question.placeholder,
    });
  }
  if (question.kind === "nps" || question.kind === "csat") {
    if (question.lowLabel) {
      entries.push({
        field: "lowLabel",
        label: "低分标签",
        text: question.lowLabel,
      });
    }
    if (question.highLabel) {
      entries.push({
        field: "highLabel",
        label: "高分标签",
        text: question.highLabel,
      });
    }
  }
  if (question.kind === "contact") {
    entries.push({
      field: "consentText",
      label: "联系同意文案",
      text: question.consentText,
    });
  }
  if (
    (question.kind === "welcome" || question.kind === "end") &&
    question.buttonLabel
  ) {
    entries.push({
      field: "buttonLabel",
      label: "按钮文案",
      text: question.buttonLabel,
    });
  }
  return entries;
}

function toQuestionDraft(
  question: SurveyQuestionV1,
  locale: SurveyLocale,
): QuestionDraft {
  const options = choiceOptions(question);
  return {
    id: question.id,
    kind: question.kind,
    title: localizedValue(question.title, locale),
    required: question.required === true,
    options: options.length
      ? options.map((option) => localizedValue(option.label, locale))
      : undefined,
  };
}

function uniqueOptionId(label: string, index: number): string {
  const normalized = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${normalized || "option"}-${index + 1}`;
}

function convertQuestion(
  current: SurveyQuestionV1,
  patch: Partial<QuestionDraft>,
  locale: SurveyLocale,
): SurveyQuestionV1 {
  const kind = patch.kind ?? current.kind;
  const title =
    patch.title === undefined
      ? current.title
      : withLocalizedValue(current.title, locale, patch.title);
  const required = patch.required ?? current.required ?? false;
  const base = {
    id: current.id,
    title,
    ...(current.description ? { description: current.description } : {}),
    ...(current.visibleWhen ? { visibleWhen: current.visibleWhen } : {}),
  };
  if (kind === "single_choice" || kind === "multiple_choice") {
    const previous = choiceOptions(current);
    const labels =
      patch.options ??
      (previous.length
        ? previous.map((item) => localizedValue(item.label, locale))
        : ["Option 1", "Option 2"]);
    const options = labels.map((label, index) => ({
      id: previous[index]?.id ?? uniqueOptionId(label, index),
      label: withLocalizedValue(previous[index]?.label, locale, label),
    }));
    return kind === "single_choice"
      ? { ...base, kind, required, options }
      : { ...base, kind, required, options };
  }
  if (kind === "short_text" || kind === "long_text") {
    return {
      ...base,
      kind,
      required,
      maxLength: kind === "short_text" ? 240 : 4000,
    };
  }
  if (kind === "nps") return { ...base, kind, required };
  if (kind === "csat") return { ...base, kind, required, scale: 5 };
  if (kind === "star_rating") return { ...base, kind, required, stars: 5 };
  if (kind === "contact") {
    const consentText =
      current.kind === "contact"
        ? current.consentText
        : withLocalizedValue(
            undefined,
            locale,
            "I agree to be contacted about this feedback.",
          );
    return { ...base, kind, required, collect: ["email"], consentText };
  }
  if (kind === "consent") return { ...base, kind, required: true };
  if (kind === "welcome") return { ...base, kind };
  return { ...base, kind: "end" };
}

function newQuestion(
  kind: QuestionKind,
  locale: SurveyLocale,
): SurveyQuestionV1 {
  const id = `${kind}-${Date.now()}`;
  const titleValue =
    kind === "welcome"
      ? "Welcome to the survey"
      : kind === "end"
        ? "Thank you for your feedback"
        : `New ${QUESTION_KIND_LABELS[kind]} question`;
  const seed = {
    id,
    kind: "welcome" as const,
    title: { [locale]: titleValue },
  };
  return convertQuestion(
    seed,
    {
      kind,
      required: !["welcome", "end"].includes(kind),
      options:
        kind === "single_choice" || kind === "multiple_choice"
          ? ["Option 1", "Option 2"]
          : undefined,
    },
    locale,
  );
}

function clearQuestionReferences(
  definition: SurveyDefinitionV1,
  questionId: string,
): SurveyDefinitionV1 {
  const questions = definition.questions
    .filter((question) => question.id !== questionId)
    .map((question) => {
      if (!question.visibleWhen) return question;
      const conditions = question.visibleWhen.conditions.filter(
        (condition) => condition.questionId !== questionId,
      );
      return conditions.length
        ? { ...question, visibleWhen: { ...question.visibleWhen, conditions } }
        : ({ ...question, visibleWhen: undefined } as SurveyQuestionV1);
    });
  const navigation = definition.navigation?.filter(
    (rule) =>
      rule.fromQuestionId !== questionId &&
      (rule.action.type !== "go_to" || rule.action.questionId !== questionId) &&
      !rule.when?.conditions.some(
        (condition) => condition.questionId === questionId,
      ),
  );
  return { ...definition, questions, navigation };
}

const tabs: readonly { id: EditorTab; label: string }[] = [
  { id: "build", label: "内容" },
  { id: "logic", label: "逻辑" },
  { id: "audience", label: "受众与触发" },
  { id: "translations", label: "翻译" },
  { id: "style", label: "样式" },
  { id: "reward", label: "奖励" },
  { id: "publish", label: "发布" },
];

const addableKinds: QuestionKind[] = [
  "single_choice",
  "multiple_choice",
  "short_text",
  "long_text",
  "nps",
  "csat",
  "star_rating",
  "contact",
  "consent",
  "welcome",
  "end",
];

export function SurveyEditorPage({
  embedded = false,
  backAction,
  initialDefinition,
  initialStatus = "DRAFT",
  initialVersion,
  versions = [],
  placements = [],
  onSave,
  onPublish,
  onSavePlacement,
  onCreateStandaloneLink,
}: {
  embedded?: boolean;
  backAction?: ReactNode;
  initialDefinition?: SurveyDefinitionV1;
  initialStatus?: SurveyEditorStatus;
  initialVersion?: number;
  versions?: readonly EditorVersion[];
  placements?: readonly EditorPlacement[];
  onSave?: (definition: SurveyDefinitionV1) => Promise<void>;
  onPublish?: (
    definition: SurveyDefinitionV1,
    releaseNote?: string,
  ) => Promise<number | EditorVersion | void>;
  onSavePlacement?: (placement: Omit<EditorPlacement, "id">) => Promise<void>;
  onCreateStandaloneLink?: () => Promise<string>;
}) {
  const { t, date } = useAdminI18n();
  const [tab, setTab] = useState<EditorTab>("build");
  const [definition, setDefinition] = useState<SurveyDefinitionV1>(() =>
    structuredClone(initialDefinition ?? TEMPLATE_OPTIONS[0].definition),
  );
  const [selectedId, setSelectedId] = useState(
    (initialDefinition ?? TEMPLATE_OPTIONS[0].definition).questions[1]?.id ??
      (initialDefinition ?? TEMPLATE_OPTIONS[0].definition).questions[0]?.id ??
      "",
  );
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [published, setPublished] = useState(
    initialStatus === "PUBLISHED" ||
      initialStatus === "PAUSED" ||
      Boolean(initialVersion),
  );
  const [currentStatus, setCurrentStatus] = useState(initialStatus);
  const [publishedVersion, setPublishedVersion] = useState(initialVersion ?? 0);
  const [versionRows, setVersionRows] = useState<readonly EditorVersion[]>(versions);
  const [dirty, setDirty] = useState(false);
  const [operation, setOperation] = useState<"idle" | "saving" | "publishing">(
    "idle",
  );
  const [operationError, setOperationError] = useState<string | null>(null);
  const [previewLocale, setPreviewLocale] = useState<SurveyLocale>("en");
  const [previewProduct, setPreviewProduct] = useState<
    "paper7" | "bricbloc" | "nexus"
  >("paper7");
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");
  const [accent, setAccentState] = useState(
    typeof definition.metadata?.accentColor === "string"
      ? definition.metadata.accentColor
      : "#167b5b",
  );
  const [radius, setRadiusState] = useState(
    typeof definition.metadata?.borderRadius === "number"
      ? String(definition.metadata.borderRadius)
      : "4",
  );
  const [rewardEnabled, setRewardEnabledState] = useState(
    definition.metadata?.rewardEnabled === true,
  );

  const updateDefinition = (
    updater: (current: SurveyDefinitionV1) => SurveyDefinitionV1,
  ) => {
    setDefinition((current) => updater(current));
    setDirty(true);
  };
  const questions = useMemo(
    () =>
      definition.questions.map((question) =>
        toQuestionDraft(question, definition.defaultLocale),
      ),
    [definition],
  );
  const validation = useMemo(
    () => validateSurveyDefinition(definition),
    [definition],
  );

  const selected =
    questions.find((question) => question.id === selectedId) ?? questions[0];
  const moveQuestion = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    updateDefinition((current) => {
      const sourceIndex = current.questions.findIndex(
        (item) => item.id === sourceId,
      );
      const targetIndex = current.questions.findIndex(
        (item) => item.id === targetId,
      );
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current.questions];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return { ...current, questions: next };
    });
  };
  const reorder = (id: string, direction: -1 | 1) => {
    const index = questions.findIndex((question) => question.id === id);
    const target = questions[index + direction];
    if (target) moveQuestion(id, target.id);
  };
  const updateSelected = (patch: Partial<QuestionDraft>) =>
    updateDefinition((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.id === selectedId
          ? convertQuestion(question, patch, current.defaultLocale)
          : question,
      ),
    }));
  const updateSelectedVisibility = (
    visibleWhen: AnswerConditionGroup | undefined,
  ) =>
    updateDefinition((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.id === selectedId
          ? ({ ...question, visibleWhen } as SurveyQuestionV1)
          : question,
      ),
    }));
  const addQuestion = (kind: QuestionKind) => {
    const next = newQuestion(kind, definition.defaultLocale);
    updateDefinition((current) => ({
      ...current,
      questions: [...current.questions, next],
    }));
    setSelectedId(next.id);
  };
  const removeSelected = () => {
    if (!selected || questions.length <= 1) return;
    const index = questions.findIndex(
      (question) => question.id === selected.id,
    );
    const next = questions.filter((question) => question.id !== selected.id);
    updateDefinition((current) =>
      clearQuestionReferences(current, selected.id),
    );
    setSelectedId(next[Math.max(0, index - 1)]?.id ?? "");
  };
  const markSaved = () => {
    setSavedAt(new Date());
    setDirty(false);
  };
  const save = async (): Promise<boolean> => {
    setOperation("saving");
    setOperationError(null);
    try {
      await onSave?.(definition);
      markSaved();
      return true;
    } catch (cause) {
      setOperationError(
        cause instanceof Error ? cause.message : t("无法保存草稿"),
      );
      return false;
    } finally {
      setOperation("idle");
    }
  };
  const publish = async (releaseNote?: string) => {
    setOperation("publishing");
    setOperationError(null);
    try {
      await onSave?.(definition);
      const nextVersion = await onPublish?.(definition, releaseNote);
      markSaved();
      setPublished(true);
      setCurrentStatus("PUBLISHED");
      const resolvedVersion =
        typeof nextVersion === "number"
          ? nextVersion
          : nextVersion && typeof nextVersion === "object"
            ? nextVersion.version
          : Math.max(1, publishedVersion + 1);
      if (nextVersion && typeof nextVersion === "object") {
        setVersionRows((current) => [
          nextVersion,
          ...current
            .filter((item) => item.id !== nextVersion.id)
            .map((item) => ({ ...item, active: false })),
        ]);
      }
      setPublishedVersion(resolvedVersion);
      setDefinition((current) => ({ ...current, version: resolvedVersion }));
      return true;
    } catch (cause) {
      setOperationError(
        cause instanceof Error ? cause.message : t("发布检查未通过"),
      );
      return false;
    } finally {
      setOperation("idle");
    }
  };
  const updateMetadata = (
    patch: Record<string, string | number | boolean | readonly string[]>,
  ) =>
    updateDefinition((current) => ({
      ...current,
      metadata: { ...(current.metadata ?? {}), ...patch },
    }));
  const setAccent = (value: string) => {
    setAccentState(value);
    updateMetadata({ accentColor: value });
  };
  const setRadius = (value: string) => {
    setRadiusState(value);
    updateMetadata({ borderRadius: Number(value) || 0 });
  };
  const setRewardEnabled = (value: boolean) => {
    setRewardEnabledState(value);
    updateDefinition((current) => ({
      ...current,
      metadata: {
        rewardType: "percentage",
        rewardValue: 10,
        rewardMinimumSubtotal: 0,
        rewardValidForDays: 14,
        rewardProductScope: "core_products",
        rewardCombinesShipping: false,
        rewardAnonymousRisk: false,
        ...(current.metadata ?? {}),
        rewardEnabled: value,
      },
    }));
  };
  const savedAtLabel = savedAt
    ? date(savedAt, { hour: "2-digit", minute: "2-digit" })
    : t("尚未保存");

  return (
    <div
      className={`sp-page-content sp-editor-page ${embedded ? "is-embedded" : ""}`}
    >
      {!embedded ? (
        <PageHeader
          eyebrow={`${t("问卷编辑器")} · ${publishedVersion ? `v${publishedVersion}` : t("草稿")}`}
          title={definition.internalName}
          description={`${dirty ? t("有未保存更改") : t("所有更改已保存")} · ${savedAtLabel}`}
          actions={
            <div className="sp-button-row">
              {backAction}
              <button
                type="button"
                className="sp-button sp-button-secondary"
                disabled={operation !== "idle"}
                onClick={() => void save()}
              >
                {operation === "saving" ? t("保存中…") : t("保存")}
              </button>
              <button
                type="button"
                className="sp-button"
                onClick={() => setTab("publish")}
              >
                {t("检查并发布")}
              </button>
            </div>
          }
        />
      ) : null}

      <div className="sp-editor-commandbar">
        <div className="sp-editor-name">
          <input
            aria-label={t("问卷内部名称")}
            value={definition.internalName}
            onChange={(event) =>
              updateDefinition((current) => ({
                ...current,
                internalName: event.currentTarget.value,
              }))
            }
          />
          <StatusBadge
            tone={
              currentStatus === "PAUSED"
                ? "warning"
                : published
                  ? "success"
                  : "neutral"
            }
          >
            {currentStatus === "PAUSED"
              ? t("已暂停 · v{version}", { version: publishedVersion })
              : published
                ? t("运行中 · v{version}", { version: publishedVersion })
                : publishedVersion
                  ? t("草稿 · 基于 v{version}", { version: publishedVersion })
                  : t("草稿 · 未发布")}
          </StatusBadge>
        </div>
        <span className="sp-muted">
          {dirty ? t("未保存") : t("已保存 {time}", { time: savedAtLabel })}
        </span>
        <div className="sp-button-row">
          <button
            type="button"
            className="sp-button sp-button-quiet"
            disabled={operation !== "idle" || !dirty}
            onClick={() => void save()}
          >
            {operation === "saving" ? t("保存中…") : t("保存")}
          </button>
          <button
            type="button"
            className="sp-button"
            onClick={() => setTab("publish")}
          >
            {published ? t("发布新版本") : t("检查并发布")}
          </button>
        </div>
      </div>

      {operationError ? (
        <Notice tone="warning" title={t("操作未完成")}>
          {operationError}
        </Notice>
      ) : null}

      <nav className="sp-editor-tabs" aria-label={t("问卷设置")}>
        {tabs.map((item) => (
          <button
            type="button"
            key={item.id}
            className={tab === item.id ? "is-active" : ""}
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => setTab(item.id)}
          >
            {t(item.label)}
            {item.id === "translations" ? (
              <span className="sp-tab-count">
                {
                  definition.enabledLocales.filter((locale) =>
                    translationComplete(definition, locale),
                  ).length
                }
                /{definition.enabledLocales.length}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      {tab === "build" ? (
        <BuildTab
          definition={definition}
          questions={questions}
          selected={selected}
          selectedId={selectedId}
          draggedId={draggedId}
          setSelectedId={setSelectedId}
          setDraggedId={setDraggedId}
          onDrop={moveQuestion}
          onReorder={reorder}
          onUpdate={updateSelected}
          onUpdateVisibility={updateSelectedVisibility}
          onRemove={removeSelected}
          onAdd={addQuestion}
          previewLocale={previewLocale}
          previewProduct={previewProduct}
          previewDevice={previewDevice}
          setPreviewLocale={setPreviewLocale}
          setPreviewProduct={setPreviewProduct}
          setPreviewDevice={setPreviewDevice}
          accent={accent}
          radius={radius}
          reward={rewardEnabled}
        />
      ) : null}
      {tab === "logic" ? (
        <LogicTab
          definition={definition}
          navigation={definition.navigation ?? []}
          validation={validation}
          onChange={(navigation) =>
            updateDefinition((current) => ({ ...current, navigation }))
          }
        />
      ) : null}
      {tab === "audience" ? (
        <AudienceTab
          placements={placements}
          onSave={onSavePlacement}
          onCreateStandaloneLink={onCreateStandaloneLink}
        />
      ) : null}
      {tab === "translations" ? (
        <TranslationsTab
          definition={definition}
          onChange={(next) => updateDefinition(() => next)}
        />
      ) : null}
      {tab === "style" ? (
        <StyleTab
          definition={definition}
          accent={accent}
          setAccent={setAccent}
          radius={radius}
          setRadius={setRadius}
          locale={previewLocale}
          setLocale={setPreviewLocale}
          reward={rewardEnabled}
          metadata={definition.metadata}
          onConfigChange={updateMetadata}
        />
      ) : null}
      {tab === "reward" ? (
        <RewardTab
          enabled={rewardEnabled}
          setEnabled={setRewardEnabled}
          metadata={definition.metadata}
          onConfigChange={updateMetadata}
        />
      ) : null}
      {tab === "publish" ? (
        <PublishTab
          published={published}
          version={publishedVersion}
          pending={operation === "publishing"}
          definition={definition}
          validation={validation}
          rewardEnabled={rewardEnabled}
          versions={versionRows}
          onPublish={publish}
        />
      ) : null}
    </div>
  );
}

function BuildTab({
  definition,
  questions,
  selected,
  selectedId,
  draggedId,
  setSelectedId,
  setDraggedId,
  onDrop,
  onReorder,
  onUpdate,
  onUpdateVisibility,
  onRemove,
  onAdd,
  previewLocale,
  previewProduct,
  previewDevice,
  setPreviewLocale,
  setPreviewProduct,
  setPreviewDevice,
  accent,
  radius,
  reward,
}: {
  definition: SurveyDefinitionV1;
  questions: QuestionDraft[];
  selected?: QuestionDraft;
  selectedId: string;
  draggedId: string | null;
  setSelectedId: (id: string) => void;
  setDraggedId: (id: string | null) => void;
  onDrop: (source: string, target: string) => void;
  onReorder: (id: string, direction: -1 | 1) => void;
  onUpdate: (patch: Partial<QuestionDraft>) => void;
  onUpdateVisibility: (
    visibleWhen: AnswerConditionGroup | undefined,
  ) => void;
  onRemove: () => void;
  onAdd: (kind: QuestionKind) => void;
  previewLocale: SurveyLocale;
  previewProduct: "paper7" | "bricbloc" | "nexus";
  previewDevice: PreviewDevice;
  setPreviewLocale: (locale: SurveyLocale) => void;
  setPreviewProduct: (product: "paper7" | "bricbloc" | "nexus") => void;
  setPreviewDevice: (device: PreviewDevice) => void;
  accent: string;
  radius: string;
  reward: boolean;
}) {
  const { t, locale: adminLocale } = useAdminI18n();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const selectedQuestion = definition.questions.find(
    (question) => question.id === selectedId,
  );
  const selectedQuestionIndex = definition.questions.findIndex(
    (question) => question.id === selectedId,
  );
  const visibilityConditionQuestions = definition.questions.slice(
    0,
    Math.max(0, selectedQuestionIndex),
  );
  return (
    <div className="sp-editor-grid">
      <aside className="sp-editor-outline">
        <header>
          <strong>{t("问题")}</strong>
          <span>{questions.length}</span>
        </header>
        <div className="sp-question-list">
          {questions.map((question, index) => (
            <div
              key={question.id}
              draggable
              onDragStart={(event: DragEvent<HTMLDivElement>) => {
                setDraggedId(question.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedId) onDrop(draggedId, question.id);
                setDraggedId(null);
              }}
              className={`sp-question-item ${selectedId === question.id ? "is-selected" : ""} ${draggedId === question.id ? "is-dragging" : ""}`}
            >
              <button
                type="button"
                className="sp-drag-handle"
                aria-label={t("拖动第 {number} 题", { number: index + 1 })}
                title={t("拖动排序")}
              >
                ⠿
              </button>
              <button
                type="button"
                className="sp-question-main"
                onClick={() => setSelectedId(question.id)}
              >
                <span>{index + 1}</span>
                <span>
                  <strong>{question.title}</strong>
                  <small>
                    {t(QUESTION_KIND_LABELS[question.kind])}
                    {question.required ? ` · ${t("必答")}` : ""}
                  </small>
                </span>
              </button>
              <span className="sp-reorder-buttons">
                <button
                  type="button"
                  aria-label={t("上移")}
                  disabled={index === 0}
                  onClick={() => onReorder(question.id, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={t("下移")}
                  disabled={index === questions.length - 1}
                  onClick={() => onReorder(question.id, 1)}
                >
                  ↓
                </button>
              </span>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="sp-add-question"
          onClick={() => setPaletteOpen((value) => !value)}
        >
          + {t("添加问题")}
        </button>
        {paletteOpen ? (
          <div className="sp-question-palette">
            {addableKinds.map((kind) => (
              <button
                type="button"
                key={kind}
                onClick={() => {
                  onAdd(kind);
                  setPaletteOpen(false);
                }}
              >
                {t(QUESTION_KIND_LABELS[kind])}
              </button>
            ))}
          </div>
        ) : null}
      </aside>

      <main className="sp-editor-inspector">
        {selected ? (
          <>
            <div className="sp-inspector-title">
              <div>
                <span className="sp-eyebrow">{t("问题设置")}</span>
                <h2>{t(QUESTION_KIND_LABELS[selected.kind])}</h2>
              </div>
              <button
                type="button"
                className="sp-danger-link"
                onClick={onRemove}
              >
                {t("删除")}
              </button>
            </div>
            <div className="sp-form-stack">
              <Field label={t("题目")}>
                <textarea
                  rows={3}
                  value={selected.title}
                  onChange={(event) =>
                    onUpdate({ title: event.currentTarget.value })
                  }
                />
              </Field>
              <div className="sp-field-grid">
                <Field label={t("题型")}>
                  <select
                    value={selected.kind}
                    onChange={(event) =>
                      onUpdate({
                        kind: event.currentTarget.value as QuestionKind,
                      })
                    }
                  >
                    {addableKinds.map((kind) => (
                      <option key={kind} value={kind}>
                        {t(QUESTION_KIND_LABELS[kind])}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("数据键")} hint={t("发布后不可修改")}>
                  <input value={selected.id} readOnly />
                </Field>
              </div>
              {selected.options ? (
                <Field
                  label={t("选项")}
                  hint={t("每行一个选项；拖动问题不会改变历史快照。")}
                >
                  <textarea
                    rows={Math.max(4, selected.options.length)}
                    value={selected.options.join("\n")}
                    onChange={(event) =>
                      onUpdate({
                        options: event.currentTarget.value
                          .split("\n")
                          .filter(Boolean),
                      })
                    }
                  />
                </Field>
              ) : null}
              {!["welcome", "end"].includes(selected.kind) ? (
                <Toggle
                  checked={selected.required}
                  onChange={(checked) => onUpdate({ required: checked })}
                  label={t("必答")}
                  description={t("未回答时不能进入下一题")}
                />
              ) : null}
              {["single_choice", "multiple_choice"].includes(selected.kind) ? (
                <Toggle
                  checked
                  onChange={() => undefined}
                  label={t("选择后立即保存")}
                  description={t("离开或刷新后仍可续填")}
                  disabled
                />
              ) : null}
              <details className="sp-details" open>
                <summary>{t("显示条件")}</summary>
                <Toggle
                  checked={Boolean(selectedQuestion?.visibleWhen)}
                  onChange={(enabled) => {
                    const source = firstAnswerableQuestion(
                      visibilityConditionQuestions,
                    );
                    onUpdateVisibility(
                      enabled && source
                        ? {
                            mode: "all",
                            conditions: [defaultCondition(source)],
                          }
                        : undefined,
                    );
                  }}
                  disabled={
                    !selectedQuestion?.visibleWhen &&
                    !firstAnswerableQuestion(visibilityConditionQuestions)
                  }
                  label={t("显示条件")}
                  description={
                    adminLocale === "en"
                      ? "Show this question only when the answer conditions match"
                      : "仅在答案满足条件时显示此题"
                  }
                />
                {selectedQuestion?.visibleWhen ? (
                  <ConditionGroupEditor
                    group={selectedQuestion.visibleWhen}
                    questions={visibilityConditionQuestions}
                    locale={definition.defaultLocale}
                    idPrefix={`visible-${selectedId}`}
                    onChange={onUpdateVisibility}
                  />
                ) : null}
              </details>
            </div>
          </>
        ) : null}
      </main>

      <aside className="sp-editor-preview-column">
        <div className="sp-preview-toolbar">
          <select
            aria-label={t("预览产品")}
            value={previewProduct}
            onChange={(event) =>
              setPreviewProduct(
                event.currentTarget.value as typeof previewProduct,
              )
            }
          >
            <option value="paper7">Paper7</option>
            <option value="bricbloc">Bricbloc</option>
            <option value="nexus">Nexus</option>
          </select>
          <select
            aria-label={t("预览语言")}
            value={previewLocale}
            onChange={(event) =>
              setPreviewLocale(event.currentTarget.value as SurveyLocale)
            }
          >
            <option value="en">English</option>
            <option value="de">Deutsch</option>
            <option value="es">Español</option>
          </select>
          <div
            className="sp-icon-toggle"
            role="group"
            aria-label={t("预览设备")}
          >
            <button
              type="button"
              className={previewDevice === "desktop" ? "is-active" : ""}
              aria-label={t("桌面预览")}
              onClick={() => setPreviewDevice("desktop")}
            >
              ▰
            </button>
            <button
              type="button"
              className={previewDevice === "mobile" ? "is-active" : ""}
              aria-label={t("移动预览")}
              onClick={() => setPreviewDevice("mobile")}
            >
              ▯
            </button>
          </div>
        </div>
        <div
          className={`sp-preview-stage is-${previewDevice}`}
          style={
            {
              "--preview-accent": accent,
              "--preview-radius": `${radius}px`,
            } as React.CSSProperties
          }
        >
          <SurveyPreview
            key={`${previewLocale}-${previewProduct}`}
            definition={definition}
            locale={previewLocale}
            product={previewProduct}
            compact
            reward={reward}
          />
        </div>
      </aside>
    </div>
  );
}

const answerableKinds = new Set<QuestionKind>([
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

function firstAnswerableQuestion(
  questions: readonly SurveyQuestionV1[],
  excludeQuestionId?: string,
): SurveyQuestionV1 | undefined {
  return questions.find(
    (question) =>
      question.id !== excludeQuestionId && answerableKinds.has(question.kind),
  );
}

function operatorsForQuestion(
  question: SurveyQuestionV1 | undefined,
): readonly AnswerConditionOperator[] {
  if (!question || question.kind === "contact") {
    return ["is_answered", "is_not_answered"];
  }
  if (question.kind === "multiple_choice") {
    return ["contains", "not_contains", "is_answered", "is_not_answered"];
  }
  if (question.kind === "single_choice" || question.kind === "consent") {
    return ["equals", "not_equals", "is_answered", "is_not_answered"];
  }
  if (["nps", "csat", "star_rating"].includes(question.kind)) {
    return [
      "equals",
      "not_equals",
      "greater_than",
      "greater_than_or_equal",
      "less_than",
      "less_than_or_equal",
      "is_answered",
      "is_not_answered",
    ];
  }
  return [
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "is_answered",
    "is_not_answered",
  ];
}

function defaultCondition(
  question: SurveyQuestionV1 | undefined,
): AnswerCondition {
  if (!question) return { questionId: "", operator: "is_answered" };
  if (question.kind === "single_choice") {
    return {
      questionId: question.id,
      operator: "equals",
      value: question.options[0]?.id ?? "",
    };
  }
  if (question.kind === "multiple_choice") {
    return {
      questionId: question.id,
      operator: "contains",
      value: question.options[0]?.id ?? "",
    };
  }
  if (["nps", "csat", "star_rating"].includes(question.kind)) {
    return { questionId: question.id, operator: "equals", value: 1 };
  }
  if (question.kind === "consent") {
    return { questionId: question.id, operator: "equals", value: true };
  }
  return { questionId: question.id, operator: "is_answered" };
}

function operatorNeedsValue(operator: AnswerConditionOperator): boolean {
  return operator !== "is_answered" && operator !== "is_not_answered";
}

function operatorLabel(
  operator: AnswerConditionOperator,
  locale: AdminLocale,
): string {
  const copy: Record<AnswerConditionOperator, readonly [string, string]> = {
    equals: ["等于", "Equals"],
    not_equals: ["不等于", "Does not equal"],
    contains: ["包含", "Contains"],
    not_contains: ["不包含", "Does not contain"],
    greater_than: ["大于", "Greater than"],
    greater_than_or_equal: ["大于等于", "Greater than or equal"],
    less_than: ["小于", "Less than"],
    less_than_or_equal: ["小于等于", "Less than or equal"],
    is_answered: ["已回答", "Is answered"],
    is_not_answered: ["未回答", "Is not answered"],
  };
  return copy[operator][locale === "en" ? 1 : 0];
}

function conditionValue(
  question: SurveyQuestionV1 | undefined,
  operator: AnswerConditionOperator,
  currentValue?: AnswerCondition["value"],
): AnswerCondition["value"] {
  if (!operatorNeedsValue(operator)) return undefined;
  if (
    question?.kind === "single_choice" ||
    question?.kind === "multiple_choice"
  ) {
    const current = typeof currentValue === "string" ? currentValue : "";
    return question.options.some((option) => option.id === current)
      ? current
      : (question.options[0]?.id ?? "");
  }
  if (question?.kind === "consent") {
    return typeof currentValue === "boolean" ? currentValue : true;
  }
  if (
    question &&
    ["nps", "csat", "star_rating"].includes(question.kind)
  ) {
    return typeof currentValue === "number" ? currentValue : 1;
  }
  return typeof currentValue === "string" ? currentValue : "";
}

function ConditionValueEditor({
  condition,
  question,
  locale,
  onChange,
}: {
  condition: AnswerCondition;
  question?: SurveyQuestionV1;
  locale: SurveyLocale;
  onChange: (value: AnswerCondition["value"]) => void;
}) {
  const { t } = useAdminI18n();
  if (!operatorNeedsValue(condition.operator)) return null;
  if (
    question?.kind === "single_choice" ||
    question?.kind === "multiple_choice"
  ) {
    return (
      <select
        aria-label={t("条件值")}
        value={typeof condition.value === "string" ? condition.value : ""}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {question.options.map((option) => (
          <option key={option.id} value={option.id}>
            {localizedValue(option.label, locale)}
          </option>
        ))}
      </select>
    );
  }
  if (question?.kind === "consent") {
    return (
      <select
        aria-label={t("条件值")}
        value={String(condition.value ?? true)}
        onChange={(event) => onChange(event.currentTarget.value === "true")}
      >
        <option value="true">True</option>
        <option value="false">False</option>
      </select>
    );
  }
  const numeric =
    question && ["nps", "csat", "star_rating"].includes(question.kind);
  return (
    <input
      aria-label={t("条件值")}
      type={numeric ? "number" : "text"}
      value={
        Array.isArray(condition.value)
          ? condition.value.join(", ")
          : String(condition.value ?? "")
      }
      onChange={(event) =>
        onChange(
          numeric
            ? Number(event.currentTarget.value)
            : event.currentTarget.value,
        )
      }
    />
  );
}

function ConditionGroupEditor({
  group,
  questions,
  locale,
  excludeQuestionId,
  idPrefix,
  onChange,
}: {
  group: AnswerConditionGroup;
  questions: readonly SurveyQuestionV1[];
  locale: SurveyLocale;
  excludeQuestionId?: string;
  idPrefix: string;
  onChange: (group: AnswerConditionGroup) => void;
}) {
  const { t, locale: adminLocale } = useAdminI18n();
  const answerable = questions.filter(
    (question) =>
      question.id !== excludeQuestionId && answerableKinds.has(question.kind),
  );
  const updateCondition = (index: number, condition: AnswerCondition) =>
    onChange({
      ...group,
      conditions: group.conditions.map((item, itemIndex) =>
        itemIndex === index ? condition : item,
      ),
    });
  return (
    <div className="sp-form-stack">
      <Field label={t("条件关系")}>
        <select
          aria-label={`${idPrefix}-${t("条件关系")}`}
          value={group.mode}
          onChange={(event) =>
            onChange({
              ...group,
              mode: event.currentTarget.value as "all" | "any",
            })
          }
        >
          <option value="all">{t("满足全部条件")}</option>
          <option value="any">{t("满足任一条件")}</option>
        </select>
      </Field>
      {group.conditions.map((condition, index) => {
        const question = questions.find(
          (item) => item.id === condition.questionId,
        );
        const operators = operatorsForQuestion(question);
        return (
          <div className="sp-condition-row" key={`${idPrefix}-${index}`}>
            <select
              aria-label={t("条件题目")}
              value={condition.questionId}
              onChange={(event) => {
                const nextQuestion = questions.find(
                  (item) => item.id === event.currentTarget.value,
                );
                updateCondition(index, defaultCondition(nextQuestion));
              }}
            >
              {answerable.map((item) => (
                <option key={item.id} value={item.id}>
                  {localizedValue(item.title, locale)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("条件运算符")}
              value={condition.operator}
              onChange={(event) => {
                const operator = event.currentTarget
                  .value as AnswerConditionOperator;
                updateCondition(index, {
                  questionId: condition.questionId,
                  operator,
                  value: conditionValue(question, operator, condition.value),
                });
              }}
            >
              {operators.map((operator) => (
                <option key={operator} value={operator}>
                  {operatorLabel(operator, adminLocale)}
                </option>
              ))}
            </select>
            <ConditionValueEditor
              condition={condition}
              question={question}
              locale={locale}
              onChange={(value) =>
                updateCondition(index, { ...condition, value })
              }
            />
            <button
              type="button"
              className="sp-button sp-button-quiet sp-button-small"
              aria-label={t("删除条件 {number}", { number: index + 1 })}
              onClick={() =>
                onChange({
                  ...group,
                  conditions: group.conditions.filter(
                    (_item, itemIndex) => itemIndex !== index,
                  ),
                })
              }
            >
              ×
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="sp-button sp-button-secondary sp-button-small"
        disabled={!answerable.length}
        onClick={() =>
          onChange({
            ...group,
            conditions: [
              ...group.conditions,
              defaultCondition(answerable[0]),
            ],
          })
        }
      >
        + {t("添加条件")}
      </button>
    </div>
  );
}

function LogicTab({
  definition,
  navigation,
  validation,
  onChange,
}: {
  definition: SurveyDefinitionV1;
  navigation: readonly NavigationRuleV1[];
  validation: ReturnType<typeof validateSurveyDefinition>;
  onChange: (navigation: readonly NavigationRuleV1[]) => void;
}) {
  const { t, locale: adminLocale } = useAdminI18n();
  const questions = definition.questions;
  const sourceQuestions = questions.filter((question) => question.kind !== "end");
  const addRule = () => {
    const source = sourceQuestions.find((question) =>
      answerableKinds.has(question.kind),
    ) ?? sourceQuestions[0];
    const target = questions.find(
      (question) => question.id !== source?.id && question.kind !== "welcome",
    );
    if (!source || !target) return;
    const conditionSource = firstAnswerableQuestion(questions);
    onChange([
      ...navigation,
      {
        id: `rule-${Date.now()}`,
        fromQuestionId: source.id,
        when: conditionSource
          ? {
              mode: "all",
              conditions: [defaultCondition(conditionSource)],
            }
          : undefined,
        action: { type: "go_to", questionId: target.id },
      },
    ]);
  };
  const updateRule = (index: number, rule: NavigationRuleV1) =>
    onChange(
      navigation.map((item, itemIndex) => (itemIndex === index ? rule : item)),
    );
  const moveRule = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= navigation.length) return;
    const next = [...navigation];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const logicIssues = validation.issues.filter((issue) =>
    [
      "duplicate_rule_id",
      "invalid_reference",
      "invalid_rule_order",
      "empty_condition_group",
      "cycle",
      "unreachable_question",
    ].includes(issue.code),
  );
  const hasIssue = (code: SurveyValidationIssue["code"]) =>
    logicIssues.some((issue) => issue.code === code);
  const hasAnyIssue = (...codes: SurveyValidationIssue["code"][]) =>
    codes.some(hasIssue);

  return (
    <div className="sp-settings-layout">
      <div className="sp-settings-main">
        <Panel
          title={t("跳题逻辑")}
          description={t("规则按顺序执行；第一条匹配规则生效。")}
          action={
            <button
              type="button"
              className="sp-button sp-button-small"
              disabled={!sourceQuestions.length || questions.length < 2}
              onClick={addRule}
            >
              + {t("添加规则")}
            </button>
          }
        >
          <div className="sp-rule-list">
            {navigation.map((rule, index) => {
              const firstConditionSource = firstAnswerableQuestion(questions);
              const goToTarget =
                rule.action.type === "go_to"
                  ? rule.action.questionId
                  : (questions.find(
                      (question) =>
                        question.id !== rule.fromQuestionId &&
                        question.kind !== "welcome",
                    )?.id ?? "");
              return (
                <div className="sp-rule-row" key={rule.id}>
                  <span className="sp-rule-index">{index + 1}</span>
                  <div className="sp-form-stack" style={{ gridColumn: "2 / -1" }}>
                    <div className="sp-field-grid">
                      <Field label={t("问题")}>
                        <select
                          aria-label={`${t("问题")} ${index + 1}`}
                          value={rule.fromQuestionId}
                          onChange={(event) =>
                            updateRule(index, {
                              ...rule,
                              fromQuestionId: event.currentTarget.value,
                            })
                          }
                        >
                          {sourceQuestions.map((question) => (
                            <option key={question.id} value={question.id}>
                              {localizedValue(
                                question.title,
                                definition.defaultLocale,
                              )}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t("操作")}>
                        <select
                          aria-label={`${t("操作")} ${index + 1}`}
                          value={rule.action.type}
                          onChange={(event) =>
                            updateRule(index, {
                              ...rule,
                              action:
                                event.currentTarget.value === "complete"
                                  ? { type: "complete" }
                                  : {
                                      type: "go_to",
                                      questionId: goToTarget,
                                    },
                            })
                          }
                        >
                          <option value="go_to">{t("立即跳转")}</option>
                          <option value="complete">{t("提前结束问卷")}</option>
                        </select>
                      </Field>
                    </div>
                    {rule.action.type === "go_to" ? (
                      <Field label={t("前往 {title}", { title: "" }).trim()}>
                        <select
                          aria-label={t("前往 {title}", { title: "" }).trim()}
                          value={rule.action.questionId}
                          onChange={(event) =>
                            updateRule(index, {
                              ...rule,
                              action: {
                                type: "go_to",
                                questionId: event.currentTarget.value,
                              },
                            })
                          }
                        >
                          {questions
                            .filter(
                              (question) =>
                                question.id !== rule.fromQuestionId &&
                                question.kind !== "welcome",
                            )
                            .map((question) => (
                              <option key={question.id} value={question.id}>
                                {localizedValue(
                                  question.title,
                                  definition.defaultLocale,
                                )}
                              </option>
                            ))}
                        </select>
                      </Field>
                    ) : null}
                    <Toggle
                      checked={!rule.when}
                      label={t("默认回退")}
                      onChange={(fallback) =>
                        updateRule(index, {
                          ...rule,
                          when:
                            fallback || !firstConditionSource
                              ? undefined
                              : {
                                  mode: "all",
                                  conditions: [
                                    defaultCondition(firstConditionSource),
                                  ],
                                },
                        })
                      }
                    />
                    {rule.when ? (
                      <ConditionGroupEditor
                        group={rule.when}
                        questions={questions}
                        locale={definition.defaultLocale}
                        idPrefix={`rule-${rule.id}`}
                        onChange={(when) => updateRule(index, { ...rule, when })}
                      />
                    ) : null}
                    <div className="sp-button-row">
                      <button
                        type="button"
                        className="sp-button sp-button-quiet sp-button-small"
                        aria-label={t("上移")}
                        disabled={index === 0}
                        onClick={() => moveRule(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="sp-button sp-button-quiet sp-button-small"
                        aria-label={t("下移")}
                        disabled={index === navigation.length - 1}
                        onClick={() => moveRule(index, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="sp-button sp-button-quiet sp-button-small"
                        aria-label={t("删除规则")}
                        onClick={() =>
                          onChange(
                            navigation.filter((item) => item.id !== rule.id),
                          )
                        }
                      >
                        × {t("删除规则")}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {!navigation.length ? (
              <p className="sp-muted">
                {t("当前按题目顺序作答，没有跳题规则。")}
              </p>
            ) : null}
          </div>
        </Panel>
      </div>
      <aside className="sp-settings-aside">
        <Panel title={t("逻辑检查")}>
          <div className="sp-readiness-list">
            <Check label={t("没有循环路径")} passed={!hasIssue("cycle")} />
            <Check
              label={t("没有不可达问题")}
              passed={!hasIssue("unreachable_question")}
            />
            <Check
              label={t("{count} 个问题均有退出路径", {
                count: questions.length,
              })}
              passed={
                !hasAnyIssue(
                  "cycle",
                  "invalid_reference",
                  "unreachable_question",
                )
              }
            />
            <Check
              label={t("默认回退路径已设置")}
              passed={!hasIssue("invalid_rule_order")}
            />
          </div>
        </Panel>
        {logicIssues.length ? (
          <Notice tone="warning" title={t("发布前仍有问题需要处理")}>
            <ul>
              {logicIssues.map((issue, index) => (
                <li key={`${issue.path}-${index}`}>
                  {validationIssueMessage(issue, adminLocale, t)}
                </li>
              ))}
            </ul>
          </Notice>
        ) : (
          <Notice tone="info" title={t("规则优先级")}>
            {t("同一问题上的规则从上到下匹配；可拖动规则调整顺序。")}
          </Notice>
        )}
      </aside>
    </div>
  );
}

const surfaceApiValue: Record<string, string> = {
  theme_inline: "THEME_INLINE",
  theme_popup: "THEME_POPUP",
  thank_you: "THANK_YOU",
  order_status: "ORDER_STATUS",
  standalone: "STANDALONE",
  klaviyo_email: "KLAVIYO_EMAIL",
  klaviyo_sms: "KLAVIYO_SMS",
};

const surfaceEditorValue = Object.fromEntries(
  Object.entries(surfaceApiValue).map(([editor, api]) => [api, editor]),
) as Record<string, string>;

function audienceValueText(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseAudienceValue(value: string, operator: string): unknown {
  const trimmed = value.trim();
  if (["exists", "not_exists"].includes(operator)) return true;
  if (["in", "not_in"].includes(operator)) {
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed === "true" || trimmed === "false") return trimmed === "true";
  return trimmed;
}

function configRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function AudienceTab({
  placements,
  onSave,
  onCreateStandaloneLink,
}: {
  placements: readonly EditorPlacement[];
  onSave?: (placement: Omit<EditorPlacement, "id">) => Promise<void>;
  onCreateStandaloneLink?: () => Promise<string>;
}) {
  const { t, number } = useAdminI18n();
  const firstPlacement = placements[0];
  const firstTrigger = configRecord(firstPlacement?.triggerConfig);
  const [surface, setSurface] = useState(
    firstPlacement
      ? (surfaceEditorValue[firstPlacement.surface] ?? "thank_you")
      : "thank_you",
  );
  const [sample, setSample] = useState(
    Math.round((firstPlacement?.sampleRate ?? 0.1) * 100),
  );
  const [frequency, setFrequency] = useState(
    firstPlacement?.frequencyCapDays ?? 30,
  );
  const [priority, setPriority] = useState(firstPlacement?.priority ?? 100);
  const [enabled, setEnabled] = useState(firstPlacement?.enabled ?? false);
  const [startsAt, setStartsAt] = useState(
    firstPlacement?.startsAt?.slice(0, 10) ?? "",
  );
  const [endsAt, setEndsAt] = useState(
    firstPlacement?.endsAt?.slice(0, 10) ?? "",
  );
  const [maxResponses, setMaxResponses] = useState<number | "">(
    firstPlacement?.maxResponses ?? "",
  );
  const [ruleJoin, setRuleJoin] = useState<"AND" | "OR">(
    firstPlacement?.audienceRules?.[0]?.groupJoin === "OR" ? "OR" : "AND",
  );
  const [audienceRules, setAudienceRules] = useState<EditorAudienceRule[]>([
    ...(firstPlacement?.audienceRules ?? []),
  ]);
  const initialTriggerType = String(firstTrigger.type ?? "timed")
    .toLowerCase()
    .replace(/[-\s]/g, "_");
  const [triggerType, setTriggerType] = useState<
    "immediate" | "timed" | "scroll" | "exit" | "add_to_cart"
  >(
    initialTriggerType === "exit_intent"
      ? "exit"
      : ["immediate", "timed", "scroll", "exit", "add_to_cart"].includes(
            initialTriggerType,
          )
        ? (initialTriggerType as
            "immediate" | "timed" | "scroll" | "exit" | "add_to_cart")
        : "timed",
  );
  const [delaySeconds, setDelaySeconds] = useState(
    typeof firstTrigger.delaySeconds === "number"
      ? firstTrigger.delaySeconds
      : 20,
  );
  const [scrollPercent, setScrollPercent] = useState(
    typeof firstTrigger.scrollPercent === "number"
      ? firstTrigger.scrollPercent
      : 60,
  );
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [standaloneLink, setStandaloneLink] = useState("");
  const [linkPending, setLinkPending] = useState(false);
  const chooseSurface = (nextSurface: string) => {
    setSurface(nextSurface);
    const existing = placements.find(
      (placement) => placement.surface === surfaceApiValue[nextSurface],
    );
    setSample(Math.round((existing?.sampleRate ?? 0.1) * 100));
    setFrequency(existing?.frequencyCapDays ?? 30);
    setPriority(existing?.priority ?? 100);
    setEnabled(existing?.enabled ?? false);
    setStartsAt(existing?.startsAt?.slice(0, 10) ?? "");
    setEndsAt(existing?.endsAt?.slice(0, 10) ?? "");
    setMaxResponses(existing?.maxResponses ?? "");
    setRuleJoin(
      existing?.audienceRules?.[0]?.groupJoin === "OR" ? "OR" : "AND",
    );
    setAudienceRules([...(existing?.audienceRules ?? [])]);
    const trigger = configRecord(existing?.triggerConfig);
    const savedTriggerType = String(trigger.type ?? "timed")
      .toLowerCase()
      .replace(/[-\s]/g, "_");
    setTriggerType(
      savedTriggerType === "exit_intent"
        ? "exit"
        : ["immediate", "timed", "scroll", "exit", "add_to_cart"].includes(
              savedTriggerType,
            )
          ? (savedTriggerType as
              "immediate" | "timed" | "scroll" | "exit" | "add_to_cart")
          : "timed",
    );
    setDelaySeconds(
      typeof trigger.delaySeconds === "number" ? trigger.delaySeconds : 20,
    );
    setScrollPercent(
      typeof trigger.scrollPercent === "number" ? trigger.scrollPercent : 60,
    );
  };
  const savePlacement = async () => {
    const existing = placements.find(
      (placement) => placement.surface === surfaceApiValue[surface],
    );
    setPending(true);
    setResult(null);
    try {
      await onSave?.({
        surface: surfaceApiValue[surface],
        enabled,
        priority,
        sampleRate: sample / 100,
        frequencyCapDays: frequency,
        startsAt: startsAt ? `${startsAt}T00:00:00.000Z` : null,
        endsAt: endsAt ? `${endsAt}T23:59:59.999Z` : null,
        maxResponses: maxResponses === "" ? null : maxResponses,
        triggerConfig:
          surface === "theme_popup"
            ? {
                type: triggerType,
                delaySeconds,
                scrollPercent,
                mobileFallback: triggerType === "exit" ? "timed" : undefined,
                mobileDelaySeconds: triggerType === "exit" ? 20 : undefined,
                mobileScrollPercent: triggerType === "exit" ? 60 : undefined,
              }
            : (existing?.triggerConfig ?? { type: "immediate" }),
        styleConfig: existing?.styleConfig ?? { inheritShopBrand: true },
        audienceRules: audienceRules.map((rule) => ({
          ...rule,
          groupIndex: 0,
          groupJoin: ruleJoin,
        })),
      });
      setResult(t("投放设置已保存"));
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : t("无法保存投放设置"));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="sp-settings-layout">
      <div className="sp-settings-main">
        <Panel
          title={t("触达位置")}
          description={t("同一页面命中多个问卷时，仅展示优先级最高者。")}
        >
          <div className="sp-option-grid">
            {[
              {
                id: "theme_inline",
                label: "主题内嵌块",
                detail: "商品页、集合页或任意模板",
              },
              {
                id: "theme_popup",
                label: "站内弹层",
                detail: "停留、滚动、退出或加购触发",
              },
              {
                id: "thank_you",
                label: "Thank you",
                detail: "订单完成页 Checkout block",
              },
              {
                id: "order_status",
                label: "订单状态",
                detail: "客户订单状态页 block",
              },
              {
                id: "standalone",
                label: "独立链接",
                detail: "poll.harborinno.com 安全链接",
              },
              {
                id: "klaviyo_email",
                label: "Klaviyo Email",
                detail: "Flow 邮件邀请",
              },
              {
                id: "klaviyo_sms",
                label: "Klaviyo SMS",
                detail: "Flow 短信邀请",
              },
            ].map((item) => (
              <label
                aria-label={t(item.label)}
                className={`sp-option-card ${surface === item.id ? "is-selected" : ""}`}
                key={item.id}
              >
                <input
                  aria-label={t(item.label)}
                  type="radio"
                  name="surface"
                  value={item.id}
                  checked={surface === item.id}
                  onChange={() => chooseSurface(item.id)}
                />
                <span>
                  <strong>{t(item.label)}</strong>
                  <small>{t(item.detail)}</small>
                </span>
              </label>
            ))}
          </div>
        </Panel>
        <Panel
          title={t("受众规则")}
          description={t("仅支持一层 AND / OR 组，便于解释和验证。")}
        >
          <div className="sp-audience-head">
            <select
              aria-label={t("规则组关系")}
              value={ruleJoin}
              onChange={(event) =>
                setRuleJoin(event.currentTarget.value as "AND" | "OR")
              }
            >
              <option value="AND">{t("满足以下全部条件（AND）")}</option>
              <option value="OR">{t("满足任一条件（OR）")}</option>
            </select>
            <button
              type="button"
              className="sp-link-button"
              onClick={() =>
                setAudienceRules((current) => [
                  ...current,
                  {
                    groupIndex: 0,
                    groupJoin: ruleJoin,
                    field: "locale",
                    operator: "in",
                    value: ["en", "de", "es"],
                  },
                ])
              }
            >
              + {t("添加条件")}
            </button>
          </div>
          <div className="sp-rule-table">
            {audienceRules.map((rule, index) => (
              <div key={`${rule.field}-${index}`}>
                <select
                  aria-label={t("条件 {number} 字段", { number: index + 1 })}
                  value={rule.field}
                  onChange={(event) =>
                    setAudienceRules((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, field: event.currentTarget.value }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="locale">{t("语言")}</option>
                  <option value="market">{t("市场")}</option>
                  <option value="country">{t("国家 / 地区")}</option>
                  <option value="device">{t("设备")}</option>
                  <option value="pageType">{t("页面类型")}</option>
                  <option value="path">{t("页面路径")}</option>
                  <option value="productId">{t("当前商品 GID")}</option>
                  <option value="variantId">{t("当前变体 GID")}</option>
                  <option value="collectionIds">{t("集合 GID")}</option>
                  <option value="cartProductIds">{t("购物车商品 GID")}</option>
                  <option value="orderProductIds">{t("订单商品 GID")}</option>
                  <option value="orderVariantIds">{t("订单变体 GID")}</option>
                  <option value="orderAmount">{t("订单金额")}</option>
                  <option value="customerType">{t("新老客")}</option>
                  <option value="purchaseCount">{t("购买次数")}</option>
                  <option value="discountCodes">{t("折扣码")}</option>
                  <option value="source">{t("来源")}</option>
                  <option value="utmSource">UTM Source</option>
                  <option value="utmMedium">UTM Medium</option>
                  <option value="utmCampaign">UTM Campaign</option>
                </select>
                <select
                  aria-label={t("条件 {number} 运算符", { number: index + 1 })}
                  value={rule.operator}
                  onChange={(event) =>
                    setAudienceRules((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, operator: event.currentTarget.value }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="equals">{t("等于")}</option>
                  <option value="not_equals">{t("不等于")}</option>
                  <option value="in">{t("属于")}</option>
                  <option value="not_in">{t("不属于")}</option>
                  <option value="contains">{t("包含")}</option>
                  <option value="greater_than_or_equal">{t("大于等于")}</option>
                  <option value="less_than_or_equal">{t("小于等于")}</option>
                  <option value="exists">{t("存在")}</option>
                  <option value="not_exists">{t("不存在")}</option>
                </select>
                <input
                  aria-label={t("条件 {number} 值", { number: index + 1 })}
                  value={audienceValueText(rule.value)}
                  disabled={["exists", "not_exists"].includes(rule.operator)}
                  placeholder={t("多个值用逗号分隔")}
                  onChange={(event) =>
                    setAudienceRules((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              value: parseAudienceValue(
                                event.currentTarget.value,
                                item.operator,
                              ),
                            }
                          : item,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  aria-label={t("删除条件 {number}", { number: index + 1 })}
                  onClick={() =>
                    setAudienceRules((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
            {!audienceRules.length ? (
              <p className="sp-muted">
                {t("没有受众条件，所有命中触发器的访问均有资格。")}
              </p>
            ) : null}
          </div>
        </Panel>
        {surface === "theme_popup" ? (
          <Panel title={t("站内触发")}>
            <Field label={t("触发方式")}>
              <select
                aria-label={t("站内弹层触发方式")}
                value={triggerType}
                onChange={(event) =>
                  setTriggerType(
                    event.currentTarget.value as typeof triggerType,
                  )
                }
              >
                <option value="immediate">{t("立即展示")}</option>
                <option value="timed">{t("停留时间")}</option>
                <option value="scroll">{t("滚动深度")}</option>
                <option value="exit">{t("桌面退出意图")}</option>
                <option value="add_to_cart">{t("加入购物车")}</option>
              </select>
            </Field>
            {triggerType === "exit" ? (
              <p className="sp-muted sp-top-gap">
                {t("移动设备不支持退出意图，将自动改为停留 20 秒触发。")}
              </p>
            ) : null}
            <div className="sp-field-grid sp-top-gap">
              <Field label={t("停留时间（秒）")}>
                <input
                  type="number"
                  min="0"
                  value={delaySeconds}
                  disabled={triggerType !== "timed" && triggerType !== "exit"}
                  onChange={(event) =>
                    setDelaySeconds(Number(event.currentTarget.value))
                  }
                />
              </Field>
              <Field label={t("滚动比例（%）")}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={scrollPercent}
                  disabled={triggerType !== "scroll"}
                  onChange={(event) =>
                    setScrollPercent(Number(event.currentTarget.value))
                  }
                />
              </Field>
            </div>
          </Panel>
        ) : null}
        <Panel
          title={t("发布控制")}
          description={t("投放开启后才会向命中的客户展示。")}
        >
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            label={t("启用此投放位置")}
            description={t("草稿问卷必须先发布，才能启用 placement。")}
          />
          <div className="sp-button-row sp-top-gap">
            <button
              type="button"
              className="sp-button"
              disabled={pending}
              onClick={() => void savePlacement()}
            >
              {pending ? t("保存中…") : t("保存投放设置")}
            </button>
            {result ? (
              <span className="sp-muted" role="status">
                {result}
              </span>
            ) : null}
          </div>
        </Panel>
        {surface === "standalone" && onCreateStandaloneLink ? (
          <Panel
            title={t("单次安全链接")}
            description={t(
              "每个链接仅对应一条回答会话；需要多人填写时分别生成。",
            )}
          >
            <button
              type="button"
              className="sp-button"
              disabled={linkPending}
              onClick={async () => {
                setLinkPending(true);
                setResult(null);
                try {
                  setStandaloneLink(await onCreateStandaloneLink());
                } catch (cause) {
                  setResult(
                    cause instanceof Error ? cause.message : t("无法生成链接"),
                  );
                } finally {
                  setLinkPending(false);
                }
              }}
            >
              {linkPending ? t("生成中…") : t("生成 30 天链接")}
            </button>
            {standaloneLink ? (
              <div className="sp-form-stack sp-top-gap">
                <input
                  aria-label={t("独立调查链接")}
                  readOnly
                  value={standaloneLink}
                />
                <button
                  type="button"
                  className="sp-button sp-button-secondary"
                  onClick={() =>
                    void navigator.clipboard.writeText(standaloneLink)
                  }
                >
                  {t("复制链接")}
                </button>
              </div>
            ) : null}
          </Panel>
        ) : null}
      </div>
      <aside className="sp-settings-aside">
        <Panel title={t("投放控制")}>
          <div className="sp-form-stack">
            <Field label={t("抽样比例 · {sample}%", { sample })}>
              <input
                className="sp-range"
                type="range"
                min="1"
                max="100"
                value={sample}
                onChange={(event) =>
                  setSample(Number(event.currentTarget.value))
                }
              />
            </Field>
            <Field label={t("优先级")}>
              <input
                type="number"
                value={priority}
                onChange={(event) =>
                  setPriority(Number(event.currentTarget.value))
                }
              />
            </Field>
            <Field label={t("频控 · {days} 天", { days: frequency })}>
              <input
                className="sp-range"
                type="range"
                min="1"
                max="90"
                value={frequency}
                onChange={(event) =>
                  setFrequency(Number(event.currentTarget.value))
                }
              />
            </Field>
            <Field label={t("开始日期")}>
              <input
                type="date"
                value={startsAt}
                onChange={(event) => setStartsAt(event.currentTarget.value)}
              />
            </Field>
            <Field label={t("结束日期")}>
              <input
                type="date"
                value={endsAt}
                onChange={(event) => setEndsAt(event.currentTarget.value)}
              />
            </Field>
            <Field label={t("最多完成数")}>
              <input
                type="number"
                min="1"
                value={maxResponses}
                placeholder={t("不限")}
                onChange={(event) =>
                  setMaxResponses(
                    event.currentTarget.value === ""
                      ? ""
                      : Number(event.currentTarget.value),
                  )
                }
              />
            </Field>
          </div>
        </Panel>
        <Notice tone="success" title={t("预估覆盖")}>
          {t("按过去 7 天流量，{sample}% 抽样约每天产生 {count} 次曝光。", {
            sample,
            count: number(Math.round((1820 * sample) / 100)),
          })}
        </Notice>
      </aside>
    </div>
  );
}

function TranslationsTab({
  definition,
  onChange,
}: {
  definition: SurveyDefinitionV1;
  onChange: (definition: SurveyDefinitionV1) => void;
}) {
  const { t } = useAdminI18n();
  const [locale, setLocale] = useState<SurveyLocale>("de");
  const questions = definition.questions;
  const toggleEnabledLocale = (target: SurveyLocale, enabled: boolean) => {
    const next = enabled
      ? [...new Set([...definition.enabledLocales, target])]
      : definition.enabledLocales.filter((item) => item !== target);
    onChange({ ...definition, enabledLocales: next });
  };
  const updateSurveyText = (field: "title" | "description", value: string) => {
    const localized = withLocalizedValue(definition[field], locale, value);
    onChange({
      ...definition,
      [field]:
        field === "description" &&
        !Object.values(localized).some((item) => item?.trim())
          ? undefined
          : localized,
    });
  };
  const updateQuestionText = (questionId: string, value: string) =>
    onChange({
      ...definition,
      questions: questions.map((question) =>
        question.id === questionId
          ? {
              ...question,
              title: withLocalizedValue(question.title, locale, value),
            }
          : question,
      ),
    });
  const updateQuestionExtra = (
    questionId: string,
    field: QuestionLocalizedField,
    value: string,
  ) =>
    onChange({
      ...definition,
      questions: questions.map((question) => {
        if (question.id !== questionId) return question;
        const currentValue = (question as unknown as Record<string, unknown>)[
          field
        ];
        return {
          ...question,
          [field]: withLocalizedValue(
            currentValue as LocalizedText | undefined,
            locale,
            value,
          ),
        } as SurveyQuestionV1;
      }),
    });
  const updateOptionText = (
    questionId: string,
    optionId: string,
    value: string,
  ) =>
    onChange({
      ...definition,
      questions: questions.map((question) => {
        if (
          question.id !== questionId ||
          (question.kind !== "single_choice" &&
            question.kind !== "multiple_choice")
        ) {
          return question;
        }
        return {
          ...question,
          options: question.options.map((option) =>
            option.id === optionId
              ? {
                  ...option,
                  label: withLocalizedValue(option.label, locale, value),
                }
              : option,
          ),
        };
      }),
    });
  const fieldCount =
    1 +
    Number(Boolean(definition.description)) +
    questions.length +
    questions.reduce(
      (sum, question) =>
        sum +
        choiceOptions(question).length +
        questionTranslationEntries(question).length,
      0,
    );
  const complete =
    Number(Boolean(directLocalizedValue(definition.title, locale).trim())) +
    Number(
      Boolean(definition.description) &&
        Boolean(directLocalizedValue(definition.description, locale).trim()),
    ) +
    questions.reduce((sum, question) => {
      const questionComplete = Number(
        Boolean(directLocalizedValue(question.title, locale).trim()),
      );
      const optionComplete = choiceOptions(question).filter((option) =>
        directLocalizedValue(option.label, locale).trim(),
      ).length;
      const extraComplete = questionTranslationEntries(question).filter(
        (entry) => directLocalizedValue(entry.text, locale).trim(),
      ).length;
      return sum + questionComplete + optionComplete + extraComplete;
    }, 0);
  return (
    <div className="sp-settings-layout">
      <div className="sp-settings-main">
        <Panel
          title={t("客户问卷翻译")}
          description={t(
            "未知 locale 回退到 English；所有启用语言完整后才能发布。",
          )}
        >
          <div
            className="sp-language-tabs"
            role="tablist"
            aria-label={t("翻译语言")}
          >
            {(["en", "de", "es"] as SurveyLocale[]).map((item) => (
              <button
                type="button"
                role="tab"
                key={item}
                aria-selected={locale === item}
                className={locale === item ? "is-active" : ""}
                onClick={() => setLocale(item)}
              >
                <span>
                  {item === "en"
                    ? "English"
                    : item === "de"
                      ? "Deutsch"
                      : "Español"}
                </span>
                {!definition.enabledLocales.includes(item) ? (
                  <StatusBadge>{t("未启用")}</StatusBadge>
                ) : (
                  <StatusBadge
                    tone={
                      translationComplete(definition, item)
                        ? "success"
                        : "warning"
                    }
                  >
                    {translationComplete(definition, item)
                      ? t("完整")
                      : t("待补全")}
                  </StatusBadge>
                )}
              </button>
            ))}
          </div>
          <div className="sp-translation-list">
            <div className="sp-translation-row">
              <div>
                <span>{t("问卷标题")}</span>
                <p>
                  {localizedValue(definition.title, definition.defaultLocale)}
                </p>
              </div>
              <div className="sp-form-stack">
                <textarea
                  aria-label={t("{locale} 问卷标题", {
                    locale: locale.toUpperCase(),
                  })}
                  rows={2}
                  value={directLocalizedValue(definition.title, locale)}
                  onChange={(event) =>
                    updateSurveyText("title", event.currentTarget.value)
                  }
                />
                <textarea
                  aria-label={t("{locale} 问卷说明", {
                    locale: locale.toUpperCase(),
                  })}
                  rows={2}
                  placeholder={t("问卷说明（可选）")}
                  value={directLocalizedValue(definition.description, locale)}
                  onChange={(event) =>
                    updateSurveyText("description", event.currentTarget.value)
                  }
                />
              </div>
            </div>
            {questions.map((question, index) => (
              <div className="sp-translation-row" key={question.id}>
                <div>
                  <span>
                    Q{index + 1} · {t(QUESTION_KIND_LABELS[question.kind])}
                  </span>
                  <p>
                    {localizedValue(question.title, definition.defaultLocale)}
                  </p>
                </div>
                <div className="sp-form-stack">
                  <textarea
                    aria-label={t("Q{number} {locale} 翻译", {
                      number: index + 1,
                      locale: locale.toUpperCase(),
                    })}
                    rows={2}
                    value={directLocalizedValue(question.title, locale)}
                    onChange={(event) =>
                      updateQuestionText(question.id, event.currentTarget.value)
                    }
                  />
                  {questionTranslationEntries(question).map((entry) => (
                    <input
                      key={entry.field}
                      aria-label={t("Q{number} {field} {locale} 翻译", {
                        number: index + 1,
                        field: t(entry.label),
                        locale: locale.toUpperCase(),
                      })}
                      placeholder={t(entry.label)}
                      value={directLocalizedValue(entry.text, locale)}
                      onChange={(event) =>
                        updateQuestionExtra(
                          question.id,
                          entry.field,
                          event.currentTarget.value,
                        )
                      }
                    />
                  ))}
                  {choiceOptions(question).map((option, optionIndex) => (
                    <input
                      key={option.id}
                      aria-label={t("Q{number} 选项 {option} {locale} 翻译", {
                        number: index + 1,
                        option: optionIndex + 1,
                        locale: locale.toUpperCase(),
                      })}
                      value={directLocalizedValue(option.label, locale)}
                      onChange={(event) =>
                        updateOptionText(
                          question.id,
                          option.id,
                          event.currentTarget.value,
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <aside className="sp-settings-aside">
        <Panel title={t("启用语言")}>
          <div className="sp-form-stack">
            {(["en", "de", "es"] as SurveyLocale[]).map((item) => (
              <label
                className="sp-checkbox-row"
                key={item}
                aria-label={t("启用 {locale} 客户问卷语言", {
                  locale: item.toUpperCase(),
                })}
              >
                <input
                  type="checkbox"
                  checked={definition.enabledLocales.includes(item)}
                  disabled={item === definition.defaultLocale}
                  onChange={(event) =>
                    toggleEnabledLocale(item, event.currentTarget.checked)
                  }
                />
                <span>
                  <strong>
                    {item === "en"
                      ? "English"
                      : item === "de"
                        ? "Deutsch"
                        : "Español"}
                  </strong>
                  <small>
                    {item === definition.defaultLocale
                      ? t("默认语言")
                      : t("发布时检查完整性")}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </Panel>
        <Panel title={t("翻译进度")}>
          <div className="sp-locale-progress">
            <strong>
              {complete}/{fieldCount}
            </strong>
            <span>
              {locale === "en"
                ? "English"
                : locale === "de"
                  ? "Deutsch"
                  : "Español"}
            </span>
            <div className="sp-progress">
              <span
                className="sp-progress-fill sp-fill-green"
                style={{
                  width: `${fieldCount ? (complete / fieldCount) * 100 : 100}%`,
                }}
              />
            </div>
          </div>
          <div className="sp-readiness-list">
            <Check label={t("问卷标题")} />
            <Check label={t("题目文案")} />
            <Check label={t("所有选项")} />
            <Check label={t("按钮与提示")} />
          </div>
        </Panel>
        <Notice tone="info" title={t("人工维护")}>
          {t("Shopoll 不使用 AI 翻译。修改源文案后，请同步复核其他启用语言。")}
        </Notice>
      </aside>
    </div>
  );
}

function translationComplete(
  definition: SurveyDefinitionV1,
  locale: SurveyLocale,
): boolean {
  if (!directLocalizedValue(definition.title, locale).trim()) return false;
  if (
    definition.description &&
    !directLocalizedValue(definition.description, locale).trim()
  ) {
    return false;
  }
  return definition.questions.every(
    (question) =>
      Boolean(directLocalizedValue(question.title, locale).trim()) &&
      choiceOptions(question).every((option) =>
        Boolean(directLocalizedValue(option.label, locale).trim()),
      ) &&
      questionTranslationEntries(question).every((entry) =>
        Boolean(directLocalizedValue(entry.text, locale).trim()),
      ),
  );
}

function StyleTab({
  definition,
  accent,
  setAccent,
  radius,
  setRadius,
  locale,
  setLocale,
  reward,
  metadata,
  onConfigChange,
}: {
  definition: SurveyDefinitionV1;
  accent: string;
  setAccent: (value: string) => void;
  radius: string;
  setRadius: (value: string) => void;
  locale: SurveyLocale;
  setLocale: (value: SurveyLocale) => void;
  reward: boolean;
  metadata: SurveyDefinitionV1["metadata"];
  onConfigChange: (patch: Record<string, string | number | boolean>) => void;
}) {
  const { t } = useAdminI18n();
  const [density, setDensity] = useState<"comfortable" | "compact">(
    metadata?.density === "compact" ? "compact" : "comfortable",
  );
  const [logo, setLogo] = useState(metadata?.showBrand !== false);
  return (
    <div className="sp-style-layout">
      <div className="sp-style-controls">
        <Panel
          title={t("品牌样式")}
          description={t("站内与结账页面优先服从 Shopify 和主题设置。")}
        >
          <div className="sp-form-stack">
            <Field label={t("强调色")}>
              <div className="sp-color-input">
                <input
                  type="color"
                  value={accent}
                  onChange={(event) => setAccent(event.currentTarget.value)}
                />
                <input
                  value={accent}
                  onChange={(event) => setAccent(event.currentTarget.value)}
                />
              </div>
            </Field>
            <Field label={t("圆角")}>
              <select
                value={radius}
                onChange={(event) => setRadius(event.currentTarget.value)}
              >
                <option value="0">{t("直角 · 0 px")}</option>
                <option value="4">{t("紧凑 · 4 px")}</option>
                <option value="8">{t("柔和 · 8 px")}</option>
              </select>
            </Field>
            <div>
              <span className="sp-field-label">{t("间距")}</span>
              <Segmented
                value={density}
                onChange={(value) => {
                  setDensity(value);
                  onConfigChange({ density: value });
                }}
                label={t("问卷间距")}
                options={[
                  { value: "comfortable", label: t("舒适") },
                  { value: "compact", label: t("紧凑") },
                ]}
              />
            </div>
            <Toggle
              checked={logo}
              onChange={(value) => {
                setLogo(value);
                onConfigChange({ showBrand: value });
              }}
              label={t("显示 Harbor 品牌")}
              description={t("独立问卷页顶部显示字标")}
            />
          </div>
        </Panel>
        <Panel title={t("渠道行为")}>
          <div className="sp-readonly-list">
            <div>
              <span>{t("主题内嵌")}</span>
              <strong>{t("继承店铺字体与宽度")}</strong>
            </div>
            <div>
              <span>{t("主题弹层")}</span>
              <strong>{t("最大宽度 520 px")}</strong>
            </div>
            <div>
              <span>Thank you</span>
              <strong>{t("Shopify 原生表单样式")}</strong>
            </div>
            <div>
              <span>{t("独立链接")}</span>
              <strong>Professional SaaS</strong>
            </div>
          </div>
        </Panel>
      </div>
      <div className="sp-style-preview">
        <div className="sp-preview-toolbar">
          <select
            aria-label={t("预览语言")}
            value={locale}
            onChange={(event) =>
              setLocale(event.currentTarget.value as SurveyLocale)
            }
          >
            <option value="en">English</option>
            <option value="de">Deutsch</option>
            <option value="es">Español</option>
          </select>
          <StatusBadge tone="info">{t("独立链接")}</StatusBadge>
        </div>
        <div
          className={`sp-preview-stage ${density === "compact" ? "is-dense" : ""}`}
          style={
            {
              "--preview-accent": accent,
              "--preview-radius": `${radius}px`,
            } as React.CSSProperties
          }
        >
          <SurveyPreview
            key={locale}
            definition={definition}
            locale={locale}
            compact
            reward={reward}
          />
        </div>
      </div>
    </div>
  );
}

function RewardTab({
  enabled,
  setEnabled,
  metadata,
  onConfigChange,
}: {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  metadata: SurveyDefinitionV1["metadata"];
  onConfigChange: (
    patch: Record<string, string | number | boolean | readonly string[]>,
  ) => void;
}) {
  const { t } = useAdminI18n();
  const initialType =
    typeof metadata?.rewardType === "string"
      ? metadata.rewardType
      : "percentage";
  const [type, setTypeState] = useState(
    initialType === "fixed"
      ? "fixed_amount"
      : initialType === "shipping"
        ? "free_shipping"
        : initialType,
  );
  const [value, setValue] = useState(
    typeof metadata?.rewardValue === "number" ? metadata.rewardValue : 10,
  );
  const [minimum, setMinimum] = useState(
    typeof metadata?.rewardMinimumSubtotal === "number"
      ? metadata.rewardMinimumSubtotal
      : typeof metadata?.rewardMinimumSubtotal === "string"
        ? Number(metadata.rewardMinimumSubtotal)
        : 0,
  );
  const [expiresDays, setExpiresDays] = useState(
    typeof metadata?.rewardValidForDays === "number"
      ? metadata.rewardValidForDays
      : 14,
  );
  const [productScope, setProductScope] = useState(
    typeof metadata?.rewardProductScope === "string"
      ? metadata.rewardProductScope
      : "core_products",
  );
  const [combines, setCombines] = useState(
    metadata?.rewardCombinesShipping === true,
  );
  const [risk, setRiskState] = useState(metadata?.rewardAnonymousRisk === true);
  const [productIds, setProductIds] = useState(
    Array.isArray(metadata?.rewardProductIds)
      ? metadata.rewardProductIds.join("\n")
      : "",
  );
  const setType = (next: string) => {
    setTypeState(next);
    const defaultValue =
      next === "percentage" ? 10 : next === "fixed_amount" ? 20 : 30;
    setValue(defaultValue);
    onConfigChange({ rewardType: next, rewardValue: defaultValue });
  };
  const setRisk = (next: boolean) => {
    setRiskState(next);
    onConfigChange({ rewardAnonymousRisk: next });
  };
  return (
    <div className="sp-settings-layout">
      <div className="sp-settings-main">
        <Panel
          title={t("完成奖励")}
          description={t(
            "每个邀请或订单最多签发一份奖励；重复提交不会生成新折扣。",
          )}
        >
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            label={t("启用一次性折扣码")}
            description={t("问卷完成且满足资格后通过 Shopify 创建")}
          />
          {enabled ? (
            <div className="sp-form-stack sp-top-gap">
              <div>
                <span className="sp-field-label">{t("奖励类型")}</span>
                <Segmented
                  value={type}
                  onChange={setType}
                  label={t("奖励类型")}
                  options={[
                    { value: "percentage", label: t("百分比") },
                    { value: "fixed_amount", label: t("固定金额") },
                    { value: "free_shipping", label: t("免邮") },
                  ]}
                />
              </div>
              <div className="sp-field-grid">
                <Field
                  label={
                    type === "percentage"
                      ? t("折扣比例（%）")
                      : type === "fixed_amount"
                        ? t("折扣金额")
                        : t("最高运费金额")
                  }
                >
                  <input
                    type="number"
                    value={value}
                    onChange={(event) => {
                      const next = Number(event.currentTarget.value);
                      setValue(next);
                      onConfigChange({ rewardValue: next });
                    }}
                  />
                </Field>
                <Field label={t("最低消费")}>
                  <input
                    type="number"
                    value={minimum}
                    onChange={(event) => {
                      const next = Number(event.currentTarget.value);
                      setMinimum(next);
                      onConfigChange({ rewardMinimumSubtotal: next });
                    }}
                  />
                </Field>
              </div>
              <Field label={t("适用商品")}>
                <select
                  value={productScope}
                  onChange={(event) => {
                    setProductScope(event.currentTarget.value);
                    onConfigChange({
                      rewardProductScope: event.currentTarget.value,
                    });
                  }}
                >
                  <option value="core_products">
                    {t("订单中的 Harbor 核心产品")}
                  </option>
                  <option value="all_products">{t("全部商品")}</option>
                  <option value="specific_products">
                    {t("指定商品或集合")}
                  </option>
                </select>
              </Field>
              {productScope === "specific_products" ? (
                <Field label={t("指定 Shopify 商品 GID（每行一个）")}>
                  <textarea
                    rows={4}
                    value={productIds}
                    placeholder="gid://shopify/Product/123456789"
                    onChange={(event) => {
                      const next = event.currentTarget.value;
                      setProductIds(next);
                      onConfigChange({
                        rewardProductIds: [
                          ...new Set(
                            next
                              .split(/[\n,]/)
                              .map((item) => item.trim())
                              .filter(Boolean),
                          ),
                        ],
                      });
                    }}
                  />
                </Field>
              ) : null}
              <div className="sp-field-grid">
                <Field label={t("有效期（天）")}>
                  <input
                    type="number"
                    min="1"
                    value={expiresDays}
                    onChange={(event) => {
                      const next = Number(event.currentTarget.value);
                      setExpiresDays(next);
                      onConfigChange({ rewardValidForDays: next });
                    }}
                  />
                </Field>
                <Field label={t("组合规则")}>
                  <select
                    value={combines ? "shipping" : "none"}
                    onChange={(event) => {
                      const next = event.currentTarget.value === "shipping";
                      setCombines(next);
                      onConfigChange({ rewardCombinesShipping: next });
                    }}
                  >
                    <option value="none">{t("不可与其他折扣叠加")}</option>
                    <option value="shipping">{t("可与运费折扣组合")}</option>
                  </select>
                </Field>
              </div>
              <Toggle
                checked={risk}
                onChange={setRisk}
                label={t("允许匿名站内问卷获得奖励")}
                description={t("可能被重复访问或自动化滥用")}
              />
              {risk ? (
                <Notice tone="warning" title={t("已确认匿名奖励风险")}>
                  {t("建议限制抽样、频控与最低消费，并监控异常签发。")}
                </Notice>
              ) : null}
            </div>
          ) : null}
        </Panel>
      </div>
      <aside className="sp-settings-aside">
        <Panel title={t("资格摘要")}>
          <div className="sp-readonly-list">
            <div>
              <span>{t("每个订单")}</span>
              <strong>{t("最多 1 份")}</strong>
            </div>
            <div>
              <span>{t("每个邀请")}</span>
              <strong>{t("最多 1 份")}</strong>
            </div>
            <div>
              <span>{t("默认有效期")}</span>
              <strong>{t("{days} 天", { days: expiresDays })}</strong>
            </div>
            <div>
              <span>{t("组合")}</span>
              <strong>
                {combines ? t("可与运费折扣组合") : t("不可叠加")}
              </strong>
            </div>
          </div>
        </Panel>
        <Notice tone="info" title={t("幂等签发")}>
          {t("完成请求、后台重试和 Klaviyo 重复 webhook 使用同一幂等键。")}
        </Notice>
      </aside>
    </div>
  );
}

type SurveyValidationIssue = ReturnType<
  typeof validateSurveyDefinition
>["issues"][number];
type Translate = ReturnType<typeof useAdminI18n>["t"];

function validationIssueMessage(
  issue: SurveyValidationIssue,
  locale: AdminLocale,
  t: Translate,
): string {
  if (locale === "en") return issue.message;

  const quoted = issue.message.match(/'([^']+)'/)?.[1] ?? "";
  const trail = issue.message.split(": ").at(-1) ?? "";
  if (issue.code === "missing_translation") {
    const missingLocale = issue.message.match(
      /^Missing (\w+) translation$/,
    )?.[1];
    return t("缺少 {locale} 翻译", { locale: missingLocale ?? "" });
  }
  if (issue.message === "The default locale must be enabled") {
    return t("必须启用默认语言");
  }
  if (issue.message === "English must be enabled as the fallback locale") {
    return t("必须启用 English 作为回退语言");
  }
  if (issue.message === "Enabled locales must be unique") {
    return t("启用语言不能重复");
  }
  if (
    issue.message === "A survey needs at least one question or content screen"
  ) {
    return t("问卷至少需要一道题或一个内容页面");
  }
  if (
    issue.message === "A condition group must contain at least one condition"
  ) {
    return t("条件组至少需要一个条件");
  }
  if (issue.message.startsWith("Unknown question")) {
    return t("未知题目“{id}”", { id: quoted });
  }
  if (issue.message.startsWith("Conditions cannot reference")) {
    return t("条件不能引用不可回答的题目“{id}”", { id: quoted });
  }
  if (issue.message.startsWith("Operator")) {
    return t("运算符“{operator}”需要一个值", { operator: quoted });
  }
  if (issue.message === "Choice questions need at least one option") {
    return t("选择题至少需要一个选项");
  }
  if (issue.message.startsWith("Duplicate option id")) {
    return t("选项数据键“{id}”重复", { id: quoted });
  }
  if (issue.message === "Multiple-choice selection limits are inconsistent") {
    return t("多选题的选择数量限制不一致");
  }
  if (issue.message === "Text length limits are inconsistent") {
    return t("文本长度限制不一致");
  }
  if (
    issue.message === "Contact questions must collect one or more unique fields"
  ) {
    return t("联系方式题必须收集至少一个不重复字段");
  }
  if (issue.message.startsWith("Duplicate question id")) {
    return t("题目数据键“{id}”重复", { id: quoted });
  }
  if (issue.message.startsWith("Duplicate navigation rule id")) {
    return t("导航规则数据键“{id}”重复", { id: quoted });
  }
  if (issue.message.startsWith("Unknown source question")) {
    return t("未知来源题目“{id}”", { id: quoted });
  }
  if (issue.message === "End screens cannot have outgoing navigation") {
    return t("结束页不能包含后续导航");
  }
  if (issue.message.startsWith("Unknown target question")) {
    return t("未知目标题目“{id}”", { id: quoted });
  }
  if (
    issue.message ===
    "No rule may follow an unconditional fallback for the same question"
  ) {
    return t("同一题目的无条件回退规则之后不能再添加规则");
  }
  if (issue.message.startsWith("Navigation cycle detected")) {
    return t("检测到导航循环：{path}", { path: trail });
  }
  if (issue.message.startsWith("Condition dependency cycle detected")) {
    return t("检测到条件依赖循环：{path}", { path: trail });
  }
  if (
    issue.message.startsWith("Question") &&
    issue.message.endsWith("cannot be reached from the start")
  ) {
    return t("从问卷开始位置无法到达题目“{id}”", { id: quoted });
  }
  return issue.message;
}

function PublishTab({
  published,
  version,
  pending,
  definition,
  validation,
  rewardEnabled,
  versions,
  onPublish,
}: {
  published: boolean;
  version: number;
  pending: boolean;
  definition: SurveyDefinitionV1;
  validation: ReturnType<typeof validateSurveyDefinition>;
  rewardEnabled: boolean;
  versions: readonly EditorVersion[];
  onPublish: (releaseNote?: string) => Promise<boolean>;
}) {
  const { t, locale, date } = useAdminI18n();
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const contentIssues = validation.issues.filter((issue) =>
    [
      "duplicate_question_id",
      "duplicate_option_id",
      "invalid_question_config",
    ].includes(issue.code),
  );
  const logicIssues = validation.issues.filter((issue) =>
    [
      "duplicate_rule_id",
      "invalid_reference",
      "invalid_rule_order",
      "empty_condition_group",
      "cycle",
      "unreachable_question",
    ].includes(issue.code),
  );
  const translationIssues = validation.issues.filter(
    (issue) =>
      issue.code === "missing_translation" || issue.code === "missing_locale",
  );
  return (
    <div className="sp-settings-layout">
      <div className="sp-settings-main">
        {published ? (
          <Notice
            tone="success"
            title={t("版本 v{version} 已发布", { version })}
          >
            {t("已发布版本被冻结；继续编辑会从 v{version} 创建新的草稿。", {
              version,
            })}
          </Notice>
        ) : null}
        {!validation.valid ? (
          <Notice tone="warning" title={t("发布前仍有问题需要处理")}>
            {validation.issues
              .slice(0, 3)
              .map(
                (issue) =>
                  `${issue.path}: ${validationIssueMessage(issue, locale, t)}`,
              )
              .join(locale === "en" ? "; " : "；")}
          </Notice>
        ) : null}
        <Panel
          title={t("发布检查")}
          description={t("所有检查通过后，会生成不可修改的问卷版本快照。")}
        >
          <div className="sp-publish-checks">
            <PublishCheck
              title={t("内容结构")}
              detail={t(
                contentIssues.length
                  ? "{questions} 个题目 · {issues} 项待修复"
                  : "{questions} 个题目 · 无重复数据键",
                {
                  questions: definition.questions.length,
                  issues: contentIssues.length,
                },
              )}
              passed={!contentIssues.length}
            />
            <PublishCheck
              title={t("条件逻辑")}
              detail={
                logicIssues.length
                  ? t("{count} 项待修复", { count: logicIssues.length })
                  : t("无循环、无不可达问题")
              }
              passed={!logicIssues.length}
            />
            <PublishCheck
              title={t("启用语言")}
              detail={
                translationIssues.length
                  ? t("{count} 处翻译待补全", {
                      count: translationIssues.length,
                    })
                  : t("{locales} 均完整", {
                      locales: definition.enabledLocales
                        .map((item) => item.toUpperCase())
                        .join(locale === "en" ? ", " : "、"),
                    })
              }
              passed={!translationIssues.length}
            />
            <PublishCheck
              title={t("受众与触发")}
              detail={t("投放设置与版本分离，可在发布后启用")}
              passed
            />
            <PublishCheck
              title={t("隐私与奖励")}
              detail={t("{contact} · 奖励{reward}", {
                contact: t(
                  definition.questions.some(
                    (question) => question.kind === "contact",
                  )
                    ? "含加密联系方式题"
                    : "不收集联系方式",
                ),
                reward: t(rewardEnabled ? "开启" : "关闭"),
              })}
              passed={
                !validation.issues.some((issue) =>
                  issue.path.includes("consentText"),
                )
              }
            />
          </div>
        </Panel>
        <Panel title={t("版本说明")}>
          <Field label={t("本次改动")}>
            <textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
            />
          </Field>
          <label
            aria-label={t("确认当前受众与抽样设置")}
            className="sp-checkbox-row"
          >
            <input
              aria-label={t("确认当前受众与抽样设置")}
              type="checkbox"
              checked={confirm}
              onChange={(event) => setConfirm(event.currentTarget.checked)}
            />
            <span>
              <strong>{t("我确认当前受众与抽样设置")}</strong>
              <small>
                {t("发布后仍可暂停 placement，但不能修改版本内容。")}
              </small>
            </span>
          </label>
          <div className="sp-publish-actions">
            <button
              type="button"
              className="sp-button"
              disabled={!confirm || pending || !validation.valid}
              onClick={() => void onPublish(note).then((succeeded) => {
                if (succeeded) {
                  setConfirm(false);
                  setNote("");
                }
              })}
            >
              {pending
                ? t("正在发布…")
                : version
                  ? t("发布新版本 v{version}", { version: version + 1 })
                  : t("发布首个版本")}
            </button>
            <span>{t("预计覆盖约 182 次曝光 / 天")}</span>
          </div>
        </Panel>
      </div>
      <aside className="sp-settings-aside">
        <Panel title={t("版本记录")}>
          <div className="sp-version-list">
            <div>
              <span>{version ? `v${version + 1}` : "v1"}</span>
              <div>
                <strong>{t("当前草稿")}</strong>
                <small>{definition.internalName}</small>
              </div>
              <StatusBadge>{t("未发布")}</StatusBadge>
            </div>
            {versions.map((item) => (
              <div key={item.id}>
                <span>{`v${item.version}`}</span>
                <div>
                  <strong>{item.releaseNote || t("已发布版本")}</strong>
                  <small>
                    {date(item.publishedAt, { dateStyle: "medium", timeStyle: "short" })}
                    {` · ${item.checksum.slice(0, 8)}`}
                  </small>
                </div>
                <StatusBadge tone={item.active ? "success" : undefined}>
                  {item.active ? t("运行中") : t("已归档")}
                </StatusBadge>
              </div>
            ))}
          </div>
        </Panel>
        <Notice tone="info" title={t("历史数据保持稳定")}>
          {t("回答保留版本、题目与选项快照；修改文案不会污染历史统计。")}
        </Notice>
      </aside>
    </div>
  );
}

function Check({ label, passed = true }: { label: string; passed?: boolean }) {
  return (
    <div>
      <span
        className={`sp-check-icon ${passed ? "is-done" : ""}`}
        aria-hidden="true"
      >
        {passed ? "✓" : "!"}
      </span>
      <span>{label}</span>
    </div>
  );
}
function PublishCheck({
  title,
  detail,
  passed,
}: {
  title: string;
  detail: string;
  passed: boolean;
}) {
  const { t } = useAdminI18n();
  return (
    <div>
      <span
        className={`sp-check-icon ${passed ? "is-done" : ""}`}
        aria-hidden="true"
      >
        {passed ? "✓" : "!"}
      </span>
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <StatusBadge tone={passed ? "success" : "warning"}>
        {passed ? t("通过") : t("待处理")}
      </StatusBadge>
    </div>
  );
}
