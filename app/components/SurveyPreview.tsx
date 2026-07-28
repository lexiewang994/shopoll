import { useMemo, useState, type CSSProperties } from "react";
import { PURCHASE_MOTIVATION_TEMPLATE } from "../data";
import {
  computeNextVisibleQuestions,
  getNextVisibleQuestion,
  hasAnswer,
  isQuestionVisible,
  type AnswerMap,
  type AnswerValue,
  type ContactAnswer,
  type SurveyDefinitionV1,
  type SurveyLocale,
  type SurveyQuestionV1,
} from "../domain";

const labels: Record<
  SurveyLocale,
  { next: string; back: string; saved: string; done: string; required: string }
> = {
  en: {
    next: "Continue",
    back: "Back",
    saved: "Saved",
    done: "Done",
    required: "Required",
  },
  de: {
    next: "Weiter",
    back: "Zurück",
    saved: "Gespeichert",
    done: "Fertig",
    required: "Erforderlich",
  },
  es: {
    next: "Continuar",
    back: "Atrás",
    saved: "Guardado",
    done: "Listo",
    required: "Obligatorio",
  },
};

function text(
  value: Partial<Record<SurveyLocale, string>> | undefined,
  locale: SurveyLocale,
) {
  return value?.[locale] || value?.en || "";
}

function autoProductQuestionId(
  definition: SurveyDefinitionV1,
): string | undefined {
  const question = definition.questions.find(
    (item) =>
      item.id === "core_product" &&
      item.kind === "single_choice" &&
      item.options.length > 0,
  );
  return question?.id;
}

function seededAnswers(
  definition: SurveyDefinitionV1,
  product: "paper7" | "bricbloc" | "nexus",
): Record<string, AnswerValue> {
  const questionId = autoProductQuestionId(definition);
  return questionId ? { [questionId]: product } : {};
}

function nextPreviewQuestion(
  definition: SurveyDefinitionV1,
  currentQuestionId: string | null,
  answers: AnswerMap,
  automaticQuestionIds: ReadonlySet<string>,
): SurveyQuestionV1 | null {
  let currentId = currentQuestionId;
  const visited = new Set<string>();
  for (let step = 0; step <= definition.questions.length; step += 1) {
    const question = getNextVisibleQuestion(definition, currentId, answers);
    if (!question || !automaticQuestionIds.has(question.id)) return question;
    if (visited.has(question.id)) return null;
    visited.add(question.id);
    currentId = question.id;
  }
  return null;
}

function contactValue(value: AnswerValue | undefined): ContactAnswer {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ContactAnswer)
    : {};
}

function canContinue(
  question: SurveyQuestionV1,
  value: AnswerValue | undefined,
): boolean {
  if (question.kind === "welcome") return true;
  if (question.kind === "end") return false;
  if (!question.required) return true;
  if (question.kind === "contact") {
    return hasAnswer(value) && contactValue(value).consent === true;
  }
  if (question.kind === "consent") return value === true;
  return hasAnswer(value);
}

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "10px 12px",
  border: "1px solid #d8ddda",
  borderRadius: "var(--preview-radius)",
  background: "#fff",
  color: "#26312b",
  font: "inherit",
  resize: "vertical",
};

function QuestionAnswer({
  question,
  locale,
  value,
  onChange,
}: {
  question: SurveyQuestionV1;
  locale: SurveyLocale;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
}) {
  if (question.kind === "single_choice") {
    return (
      <div className="sp-public-options">
        {question.options.map((option) => (
          <button
            type="button"
            key={option.id}
            className={value === option.id ? "is-selected" : ""}
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
          >
            <span className="sp-radio-mark" aria-hidden="true" />
            <span>{text(option.label, locale)}</span>
          </button>
        ))}
      </div>
    );
  }
  if (question.kind === "multiple_choice") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="sp-public-options">
        {question.options.map((option) => {
          const checked = selected.includes(option.id);
          return (
            <button
              type="button"
              key={option.id}
              className={checked ? "is-selected" : ""}
              aria-pressed={checked}
              onClick={() =>
                onChange(
                  checked
                    ? selected.filter((item) => item !== option.id)
                    : [...selected, option.id],
                )
              }
            >
              <span className="sp-radio-mark" aria-hidden="true" />
              <span>{text(option.label, locale)}</span>
            </button>
          );
        })}
      </div>
    );
  }
  if (question.kind === "short_text" || question.kind === "long_text") {
    const shared = {
      value: typeof value === "string" ? value : "",
      placeholder: text(question.placeholder, locale),
      maxLength: question.maxLength,
      style: inputStyle,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => onChange(event.currentTarget.value),
    };
    return (
      <div style={{ marginTop: 22 }}>
        {question.kind === "short_text" ? (
          <input {...shared} />
        ) : (
          <textarea {...shared} rows={5} />
        )}
      </div>
    );
  }
  if (
    question.kind === "nps" ||
    question.kind === "csat" ||
    question.kind === "star_rating"
  ) {
    const values =
      question.kind === "nps"
        ? Array.from({ length: 11 }, (_item, index) => index)
        : Array.from(
            {
              length:
                question.kind === "csat" ? question.scale : question.stars,
            },
            (_item, index) => index + 1,
          );
    return (
      <>
        <div
          className="sp-public-options"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(44px, 1fr))" }}
        >
          {values.map((score) => (
            <button
              type="button"
              key={score}
              className={value === score ? "is-selected" : ""}
              aria-pressed={value === score}
              style={{ gridTemplateColumns: "1fr", textAlign: "center" }}
              onClick={() => onChange(score)}
            >
              <span>
                {question.kind === "star_rating" ? "★" : String(score)}
              </span>
            </button>
          ))}
        </div>
        {question.kind !== "star_rating" &&
        (question.lowLabel || question.highLabel) ? (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              marginTop: 8,
              color: "#68736d",
              fontSize: 10,
            }}
          >
            <span>{text(question.lowLabel, locale)}</span>
            <span>{text(question.highLabel, locale)}</span>
          </div>
        ) : null}
      </>
    );
  }
  if (question.kind === "contact") {
    const contact = contactValue(value);
    return (
      <div className="sp-form-stack" style={{ marginTop: 22 }}>
        {question.collect.includes("email") ? (
          <input
            type="email"
            aria-label="Email"
            placeholder="Email"
            style={inputStyle}
            value={contact.email ?? ""}
            onChange={(event) =>
              onChange({ ...contact, email: event.currentTarget.value })
            }
          />
        ) : null}
        {question.collect.includes("phone") ? (
          <input
            type="tel"
            aria-label="Phone"
            placeholder="Phone"
            style={inputStyle}
            value={contact.phone ?? ""}
            onChange={(event) =>
              onChange({ ...contact, phone: event.currentTarget.value })
            }
          />
        ) : null}
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <input
            type="checkbox"
            checked={contact.consent === true}
            onChange={(event) =>
              onChange({ ...contact, consent: event.currentTarget.checked })
            }
          />
          <span>{text(question.consentText, locale)}</span>
        </label>
      </div>
    );
  }
  if (question.kind === "consent") {
    return (
      <label
        style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 22 }}
      >
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span>{text(question.description ?? question.title, locale)}</span>
      </label>
    );
  }
  return null;
}

export function SurveyPreview({
  definition: providedDefinition,
  locale = "en",
  product = "paper7",
  compact = false,
  reward = false,
  onComplete,
}: {
  definition?: SurveyDefinitionV1;
  locale?: SurveyLocale;
  product?: "paper7" | "bricbloc" | "nexus";
  compact?: boolean;
  reward?: boolean;
  onComplete?: () => void;
}) {
  const definition = providedDefinition ?? PURCHASE_MOTIVATION_TEMPLATE;
  const automaticQuestionIds = useMemo(() => {
    const ids = new Set<string>();
    const productQuestionId = autoProductQuestionId(definition);
    if (productQuestionId) ids.add(productQuestionId);
    if (!providedDefinition) {
      const welcome = definition.questions.find(
        (question) => question.kind === "welcome",
      );
      if (welcome) ids.add(welcome.id);
    }
    return ids;
  }, [definition, providedDefinition]);
  const seed = useMemo(
    () => seededAnswers(definition, product),
    [definition, product],
  );
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(
    () => seed,
  );
  const [currentId, setCurrentId] = useState<string | null>(() =>
    nextPreviewQuestion(definition, null, seed, automaticQuestionIds)?.id ?? null,
  );
  const [history, setHistory] = useState<readonly string[]>([]);
  const [saved, setSaved] = useState(false);
  const copy = labels[locale];
  const currentCandidate = definition.questions.find(
    (question) => question.id === currentId,
  );
  const current =
    currentCandidate && isQuestionVisible(currentCandidate, answers)
      ? currentCandidate
      : nextPreviewQuestion(definition, null, answers, automaticQuestionIds);
  const path = computeNextVisibleQuestions(definition, null, answers).filter(
    (question) => !automaticQuestionIds.has(question.id),
  );
  const step = Math.max(
    0,
    path.findIndex((question) => question.id === current?.id),
  );
  const complete = !current || current.kind === "end";
  const completionQuestion =
    current?.kind === "end"
      ? current
      : definition.questions.find((question) => question.kind === "end");
  const metadata = definition.metadata;
  const accent =
    typeof metadata?.accentColor === "string"
      ? metadata.accentColor
      : "#167b5b";
  const radius =
    typeof metadata?.borderRadius === "number" ? metadata.borderRadius : 4;
  const densityCompact = metadata?.density === "compact";
  const showBrand = metadata?.showBrand !== false;
  const style = {
    "--preview-accent": accent,
    "--preview-radius": `${radius}px`,
  } as CSSProperties;

  const choose = (questionId: string, value: AnswerValue) => {
    setAnswers((previous) => ({ ...previous, [questionId]: value }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 900);
  };

  const next = () => {
    if (!current || !canContinue(current, answers[current.id])) return;
    const nextQuestion = nextPreviewQuestion(
      definition,
      current.id,
      answers,
      automaticQuestionIds,
    );
    setHistory((previous) => [...previous, current.id]);
    setCurrentId(nextQuestion?.id ?? null);
    if (!nextQuestion || nextQuestion.kind === "end") onComplete?.();
  };

  const reset = () => {
    const nextSeed = seededAnswers(definition, product);
    setAnswers(nextSeed);
    setHistory([]);
    setCurrentId(
      nextPreviewQuestion(
        definition,
        null,
        nextSeed,
        automaticQuestionIds,
      )?.id ?? null,
    );
  };

  return (
    <div
      className={`sp-survey-preview ${compact || densityCompact ? "is-compact" : ""}`}
      style={style}
    >
      <header className="sp-public-header">
        {showBrand ? <div className="sp-wordmark">HARBOR INNOVATIONS</div> : <span />}
        {!complete ? (
          <span>
            {step + 1} / {Math.max(1, path.length)}
          </span>
        ) : null}
      </header>
      {!complete && current ? (
        <>
          <div className="sp-public-progress">
            <span
              style={{
                width: `${((step + 1) / Math.max(1, path.length)) * 100}%`,
              }}
            />
          </div>
          <main
            className="sp-public-body"
            style={densityCompact ? { paddingTop: 24 } : undefined}
          >
            <div className="sp-public-question">
              {current.required ? (
                <div className="sp-question-kicker">{copy.required}</div>
              ) : null}
              <h2>{text(current.title, locale)}</h2>
              {current.description && current.kind !== "consent" ? (
                <p style={{ color: "#68736d", lineHeight: 1.5 }}>
                  {text(current.description, locale)}
                </p>
              ) : null}
            </div>
            <QuestionAnswer
              question={current}
              locale={locale}
              value={answers[current.id]}
              onChange={(value) => choose(current.id, value)}
            />
          </main>
          <footer className="sp-public-footer">
            <button
              type="button"
              className="sp-public-back"
              disabled={!history.length}
              onClick={() => {
                const previousId = history.at(-1);
                if (!previousId) return;
                setHistory((previous) => previous.slice(0, -1));
                setCurrentId(previousId);
              }}
            >
              {copy.back}
            </button>
            <span className={`sp-saved-state ${saved ? "is-visible" : ""}`}>
              ✓ {copy.saved}
            </span>
            <button
              type="button"
              className="sp-public-next"
              disabled={!canContinue(current, answers[current.id])}
              onClick={next}
            >
              {current.kind === "welcome"
                ? text(current.buttonLabel, locale) || copy.next
                : copy.next}{" "}
              <span aria-hidden="true">→</span>
            </button>
          </footer>
        </>
      ) : (
        <main className="sp-public-complete">
          <span className="sp-complete-mark" aria-hidden="true">
            ✓
          </span>
          <h2>
            {text(completionQuestion?.title, locale) ||
              text(definition.title, locale)}
          </h2>
          {completionQuestion?.description ? (
            <p>{text(completionQuestion.description, locale)}</p>
          ) : null}
          {reward ? (
            <div className="sp-reward-code">
              <span>HARBOR10</span>
              <small>10% OFF · 14 DAYS</small>
            </div>
          ) : null}
          <button type="button" className="sp-public-next" onClick={reset}>
            {text(completionQuestion?.buttonLabel, locale) || copy.done}
          </button>
        </main>
      )}
    </div>
  );
}
