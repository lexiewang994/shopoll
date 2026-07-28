import "@shopify/ui-extensions/preact";
import {useCallback, useEffect, useMemo, useRef, useState} from "preact/hooks";

import {BackendClient} from "./backend";
import type {
  AudienceContext,
  CompleteResponse,
  LocalizedText,
  NavigationDirective,
  ResponseSession,
  SurveyDefinitionV1,
  SurveyEnvelope,
  SurveyOption,
  SurveyQuestion,
} from "./contracts";
import {
  isAnswered,
  localized,
  nextQuestion,
  questionType,
} from "./contracts";

type Translate = (key: string, replacements?: Record<string, string | number>) => string;

interface SurveyRunnerProps {
  apiBase: string;
  context: AudienceContext;
  getSessionToken: () => Promise<string>;
  isEditorPreview: boolean;
  translate: Translate;
}

interface ReadyState {
  survey: SurveyEnvelope;
  definition: SurveyDefinitionV1;
  questions: SurveyQuestion[];
  session: ResponseSession;
}

type LoadState =
  | {kind: "loading"}
  | {kind: "hidden"}
  | {kind: "error"}
  | ({kind: "ready"} & ReadyState)
  | {kind: "complete"; result: CompleteResponse; definition: SurveyDefinitionV1};

function optionId(option: SurveyOption, index: number): string {
  return String(option.id ?? option.value ?? index);
}

function fallbackOptions(
  type: ReturnType<typeof questionType>,
  question: SurveyQuestion,
): SurveyOption[] {
  if (type === "nps") {
    return Array.from({length: 11}, (_, value) => ({id: String(value), label: String(value)}));
  }
  if (type === "csat" || type === "rating") {
    const maximum = type === "csat" ? (question.scale ?? 5) : (question.stars ?? 5);
    return Array.from({length: maximum}, (_, index) => ({id: String(index + 1), label: String(index + 1)}));
  }
  return [];
}

function displayText(value: LocalizedText | undefined, locale: string): string {
  return localized(value, locale);
}

function ErrorBanner({message}: {message: string}) {
  return <s-banner tone="critical">{message}</s-banner>;
}

export function SurveyRunner({
  apiBase,
  context,
  getSessionToken,
  isEditorPreview,
  translate,
}: SurveyRunnerProps) {
  const client = useMemo(
    () => new BackendClient({apiBase, getSessionToken}),
    [apiBase, getSessionToken],
  );
  const [loadState, setLoadState] = useState<LoadState>({kind: "loading"});
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [currentQuestionId, setCurrentQuestionId] = useState<string>("");
  const [history, setHistory] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [directives, setDirectives] = useState<Record<string, NavigationDirective>>({});
  const textTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!apiBase || !context.orderGid) {
      setLoadState(isEditorPreview && !apiBase ? {kind: "error"} : {kind: "hidden"});
      return;
    }
    setLoadState({kind: "loading"});
    setError("");
    try {
      let resolved = await client.resolve(context);
      const orderFactDeadline = Date.now() + 60_000;
      while (resolved.retryAfterMs && Date.now() < orderFactDeadline) {
        const remaining = orderFactDeadline - Date.now();
        await new Promise<void>((resolve) =>
          setTimeout(
            resolve,
            Math.min(remaining, 3000, Math.max(250, resolved.retryAfterMs ?? 1000)),
          ),
        );
        resolved = await client.resolve(context);
      }
      if (resolved.eligible === false || !resolved.survey) {
        setLoadState({kind: "hidden"});
        return;
      }
      const survey = resolved.survey;
      const definition = survey.definition ?? survey.definitionJson ?? (survey as SurveyDefinitionV1);
      const questions = (definition.questions ?? definition.nodes ?? []).filter(
        (question): question is SurveyQuestion => Boolean(question?.id),
      );
      if (!questions.length) {
        setLoadState({kind: "hidden"});
        return;
      }
      const session =
        resolved.session ?? (await client.createSession(survey, resolved.placement, context));
      const restored: Record<string, unknown> = {};
      for (const answer of session.answers ?? []) restored[answer.questionId] = answer.value;
      setAnswers(restored);
      setHistory([]);
      setCurrentQuestionId(
        String(definition.startQuestionId ?? definition.start_question_id ?? questions[0].id),
      );
      setLoadState({kind: "ready", survey, definition, questions, session});
      void client.impression(session, survey, resolved.placement, context).catch(() => undefined);
    } catch {
      setLoadState({kind: "error"});
    }
  }, [apiBase, client, context, isEditorPreview]);

  useEffect(() => {
    void load();
    return () => {
      if (textTimerRef.current) clearTimeout(textTimerRef.current);
    };
  }, [load]);

  if (loadState.kind === "hidden") return null;
  if (loadState.kind === "loading") {
    return <s-text color="subdued">{translate("loading")}</s-text>;
  }
  if (loadState.kind === "error") {
    const message = !apiBase && isEditorPreview
      ? translate("configurationMissing")
      : translate("loadError");
    return (
      <s-stack direction="block" gap="base">
        <ErrorBanner message={message} />
        {apiBase ? <s-button onClick={() => void load()}>{translate("retry")}</s-button> : null}
      </s-stack>
    );
  }
  if (loadState.kind === "complete") {
    const completion = loadState.result.completion ?? loadState.definition.completion;
    return (
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>
            {displayText(completion?.title ?? loadState.definition.thankYouTitle, context.locale) ||
              translate("thankYou")}
          </s-heading>
          <s-text>
            {displayText(completion?.message ?? loadState.definition.thankYouMessage, context.locale) ||
              translate("closeComplete")}
          </s-text>
          {loadState.result.reward?.code ? (
            <s-box border="base" padding="base">
              <s-stack direction="block" gap="small-200">
                <s-text color="subdued">{translate("rewardLabel")}</s-text>
                <s-text type="strong">{loadState.result.reward.code}</s-text>
              </s-stack>
            </s-box>
          ) : loadState.result.reward?.status === "pending" ? (
            <s-text color="subdued">{translate("rewardPending")}</s-text>
          ) : null}
        </s-stack>
      </s-section>
    );
  }

  const {definition, questions, session, survey} = loadState;
  const question = questions.find((candidate) => candidate.id === currentQuestionId);
  if (!question) return null;
  const type = questionType(question.type);
  const interactiveQuestions = questions.filter((candidate) => {
    const candidateType = questionType(candidate.type);
    return candidateType !== "welcome" && candidateType !== "end";
  });
  const progressIndex = interactiveQuestions.indexOf(question);
  const prompt = displayText(question.title ?? question.prompt, context.locale);
  const helpText = displayText(question.description ?? question.helpText, context.locale);
  const surveyTitle = displayText(definition.title ?? survey.title, context.locale);
  const currentValue = answers[question.id];

  const persist = async (
    value: unknown,
    quiet = false,
    skipped = false,
  ): Promise<NavigationDirective | undefined> => {
    try {
      if (!quiet) setSaving(true);
      const directive = await client.answer(session, question, value, skipped);
      if (directive?.complete || directive?.nextQuestionId) {
        setDirectives((previous) => ({...previous, [question.id]: directive}));
      }
      if (error) setError("");
      return directive;
    } catch {
      if (!quiet) setError(translate("saveError"));
      throw new Error("answer_save_failed");
    } finally {
      if (!quiet) setSaving(false);
    }
  };

  const updateAnswer = (value: unknown, autosave = true) => {
    setAnswers((previous) => ({...previous, [question.id]: value}));
    if (autosave) void persist(value, true).catch(() => setError(translate("saveError")));
  };

  const scheduleTextSave = (value: unknown) => {
    setAnswers((previous) => ({...previous, [question.id]: value}));
    if (textTimerRef.current) clearTimeout(textTimerRef.current);
    textTimerRef.current = setTimeout(() => {
      void persist(value, true).catch(() => undefined);
    }, 600);
  };

  const complete = async () => {
    try {
      setSaving(true);
      setError("");
      const result = await client.complete(session);
      setLoadState({kind: "complete", result, definition});
      setSaving(false);
      if (result.reward?.status === "pending") {
        void (async () => {
          for (let attempt = 0; attempt < 32; attempt += 1) {
            await new Promise<void>((resolve) => setTimeout(resolve, 2500));
            try {
              const refreshed = await client.complete(session);
              setLoadState({kind: "complete", result: refreshed, definition});
              if (refreshed.reward?.status !== "pending") return;
            } catch {
              // A transient polling failure must not hide the recorded completion.
            }
          }
        })();
      }
    } catch {
      setError(translate("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const advance = async () => {
    if (type === "end") {
      await complete();
      return;
    }
    const value = answers[question.id];
    if (type !== "welcome" && question.required !== false && !isAnswered(value)) {
      setError(translate("required"));
      return;
    }
    if (
      type === "contact" &&
      isAnswered(value) &&
      (!displayText(question.consentText, context.locale) ||
        !(value && typeof value === "object" && "consent" in value && (value as {consent?: boolean}).consent))
    ) {
      setError(translate("consentRequired"));
      return;
    }
    try {
      let directive: NavigationDirective | undefined = directives[question.id];
      if (type !== "welcome") directive = await persist(value, false, !isAnswered(value));
      const navigation = directive?.complete || directive?.nextQuestionId
        ? directive
        : nextQuestion(question, value, questions);
      if (navigation.complete) {
        await complete();
        return;
      }
      setHistory((previous) => [...previous, question.id]);
      setCurrentQuestionId(String(navigation.nextQuestionId));
      setError("");
    } catch {
      setError(translate("saveError"));
    }
  };

  const goBack = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((current) => current.slice(0, -1));
    setCurrentQuestionId(previous);
    setError("");
  };

  const renderField = () => {
    if (["single_choice", "multiple_choice", "nps", "csat", "rating"].includes(type)) {
      const options = question.options?.length ? question.options : fallbackOptions(type, question);
      const values = Array.isArray(currentValue)
        ? currentValue.map(String)
        : currentValue === undefined || currentValue === null
          ? []
          : [String(currentValue)];
      return (
        <s-stack direction="block" gap="small-200">
          <s-choice-list
            label={prompt}
            labelAccessibilityVisibility="exclusive"
            multiple={type === "multiple_choice"}
            name={`shopoll-${question.id}`}
            values={values}
            onChange={(event: Event) => {
              const selected = (event.currentTarget as HTMLElement & {values: string[]}).values ?? [];
              updateAnswer(type === "multiple_choice" ? selected : selected[0]);
            }}
          >
            {options.map((option, index) => {
              const id = optionId(option, index);
              return (
                <s-choice key={id} value={id}>
                  {displayText(option.label ?? option.text ?? option.title, context.locale) || id}
                </s-choice>
              );
            })}
          </s-choice-list>
          {(type === "nps" || type === "csat") && (question.lowLabel || question.highLabel) ? (
            <s-stack direction="inline" justifyContent="space-between">
              <s-text color="subdued">{displayText(question.lowLabel, context.locale)}</s-text>
              <s-text color="subdued">{displayText(question.highLabel, context.locale)}</s-text>
            </s-stack>
          ) : null}
        </s-stack>
      );
    }
    if (type === "consent") {
      return (
        <s-checkbox
          checked={currentValue === true}
          label={displayText(question.consentText ?? question.title, context.locale)}
          onChange={(event: Event) => {
            updateAnswer((event.currentTarget as HTMLElement & {checked: boolean}).checked);
          }}
        />
      );
    }
    if (type === "contact") {
      const legacyValue = currentValue && typeof currentValue === "object"
        ? currentValue as {value?: string; email?: string; phone?: string; consent?: boolean}
        : {value: String(currentValue ?? ""), consent: false};
      const primaryKind = question.contactKind ?? question.collect?.[0] ?? "email";
      const contactValue = legacyValue.value
        ? {...legacyValue, [primaryKind]: legacyValue.value, value: undefined}
        : legacyValue;
      const fields = question.collect?.length ? question.collect : [primaryKind];
      const consentText = displayText(question.consentText, context.locale);
      return (
        <s-stack direction="block" gap="base">
          {fields.map((kind) => (
            <s-text-field
              key={kind}
              label={kind === "email" ? "Email" : "Phone"}
              value={contactValue[kind] ?? ""}
              maxLength={question.maxLength ?? question.max_length ?? 320}
              onInput={(event: Event) => {
                const value = (event.currentTarget as HTMLElement & {value: string}).value;
                const next = {...contactValue, [kind]: value};
                setAnswers((previous) => ({...previous, [question.id]: next}));
              }}
              onBlur={() => {
                if (contactValue[kind] && consentText && contactValue.consent) {
                  void persist(contactValue, true).catch(() => undefined);
                }
              }}
            />
          ))}
          {consentText ? (
            <s-checkbox
              checked={contactValue.consent === true}
              label={consentText}
              onChange={(event: Event) => {
                const next = {
                  ...contactValue,
                  consent: (event.currentTarget as HTMLElement & {checked: boolean}).checked,
                };
                setAnswers((previous) => ({...previous, [question.id]: next}));
                const savedValue = next.consent ? next : {value: "", consent: false};
                void persist(savedValue, true).catch(() => undefined);
              }}
            />
          ) : null}
        </s-stack>
      );
    }
    if (type === "long_text") {
      return (
        <s-text-area
          label={prompt}
          labelAccessibilityVisibility="exclusive"
          value={String(currentValue ?? "")}
          maxLength={question.maxLength ?? question.max_length ?? 2000}
          rows={4}
          placeholder={displayText(question.placeholder, context.locale)}
          onInput={(event: Event) => {
            scheduleTextSave((event.currentTarget as HTMLElement & {value: string}).value);
          }}
          onBlur={() => {
            if (textTimerRef.current) clearTimeout(textTimerRef.current);
            if (isAnswered(answers[question.id])) void persist(answers[question.id], true).catch(() => undefined);
          }}
        />
      );
    }
    return (
      <s-text-field
        label={prompt}
        labelAccessibilityVisibility="exclusive"
        value={String(currentValue ?? "")}
        maxLength={question.maxLength ?? question.max_length ?? 500}
        placeholder={displayText(question.placeholder, context.locale)}
        onInput={(event: Event) => {
          scheduleTextSave((event.currentTarget as HTMLElement & {value: string}).value);
        }}
        onBlur={() => {
          if (textTimerRef.current) clearTimeout(textTimerRef.current);
          if (isAnswered(answers[question.id])) void persist(answers[question.id], true).catch(() => undefined);
        }}
      />
    );
  };

  return (
    <s-section>
      <s-stack direction="block" gap="base">
        {surveyTitle ? <s-heading>{surveyTitle}</s-heading> : null}
        {progressIndex >= 0 ? (
          <s-text color="subdued">
            {translate("questionProgress", {
              current: progressIndex + 1,
              total: interactiveQuestions.length,
            })}
          </s-text>
        ) : null}
        {prompt ? <s-heading>{prompt}</s-heading> : null}
        {helpText ? <s-text color="subdued">{helpText}</s-text> : null}
        {type !== "welcome" && type !== "end" ? renderField() : null}
        {error ? <ErrorBanner message={error} /> : null}
        <s-stack direction="inline" gap="base" justifyContent="end">
          {history.length ? (
            <s-button disabled={saving} onClick={goBack}>
              {translate("back")}
            </s-button>
          ) : null}
          <s-button variant="primary" disabled={saving} onClick={() => void advance()}>
            {displayText(question.buttonLabel, context.locale)
              || (type === "end" || question.isFinal ? translate("submit") : translate("next"))}
          </s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}
