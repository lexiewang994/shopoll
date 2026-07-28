import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Locale = "en" | "de" | "es";
type PublicValue = string | number | boolean | string[] | ContactValue;

interface ContactValue {
  email?: string;
  phone?: string;
  consent?: boolean;
}

interface PublicOption {
  id: string;
  label: string;
}

interface PublicCondition {
  questionId: string;
  operator: string;
  value?: string | number | boolean | string[];
}

interface PublicLogicRule {
  when?: { mode: "all" | "any"; conditions: PublicCondition[] };
  action: "go_to" | "complete";
  targetQuestionId?: string;
}

interface PublicQuestion {
  id: string;
  type:
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
  title: string;
  description?: string;
  required?: boolean;
  options?: PublicOption[];
  maxLength?: number;
  placeholder?: string;
  scale?: 5 | 7;
  stars?: 5 | 10;
  lowLabel?: string;
  highLabel?: string;
  consentText?: string;
  contactKind?: "email" | "phone";
  collect?: Array<"email" | "phone">;
  buttonLabel?: string;
  logic?: PublicLogicRule[];
}

interface PublicDefinition {
  schemaVersion: 1;
  surveyId: string;
  title: string;
  description?: string;
  startQuestionId?: string;
  questions: PublicQuestion[];
  completion: { title: string; message?: string };
  style?: {
    accentColor?: string;
    borderRadius?: number;
    density?: "comfortable" | "compact";
    showBrand?: boolean;
  };
  locale: Locale;
}

interface SessionEnvelope {
  id?: string;
  sessionId: string;
  resumeToken: string;
  status?: string;
  completed?: boolean;
  answers?: Array<{ questionId: string; value: PublicValue; sensitive?: boolean }>;
}

interface ResolveEnvelope {
  eligible: boolean;
  survey?: {
    id: string;
    versionId: string;
    title: string;
    definition: PublicDefinition;
  };
  placement?: { id?: string };
  session?: SessionEnvelope;
}

interface CompletionEnvelope {
  completion?: { title?: string; message?: string };
  reward?: { status?: string; code?: string; expiresAt?: string };
}

const copy: Record<Locale, Record<string, string>> = {
  en: {
    back: "Back",
    continue: "Continue",
    start: "Start survey",
    required: "Required",
    saved: "Saved",
    saving: "Saving...",
    submit: "Submit",
    retry: "Try again",
    unavailable: "This survey is not available",
    unavailableDetail: "The invitation may have expired or this order is not eligible.",
    loadError: "We could not load this survey.",
    answerError: "We could not save your answer. Please try again.",
    completionError: "Your answers are saved, but completion failed. Please try again.",
    selectRequired: "Choose an answer to continue.",
    enterRequired: "Enter an answer to continue.",
    consentRequired: "Please accept the consent statement to continue.",
    copy: "Copy code",
    copied: "Copied",
    rewardPending: "Your reward is being prepared.",
    rewardExpires: "Expires",
    privacy: "Your answers are used by Harbor Innovations for product and customer research.",
  },
  de: {
    back: "Zurück",
    continue: "Weiter",
    start: "Umfrage starten",
    required: "Erforderlich",
    saved: "Gespeichert",
    saving: "Wird gespeichert...",
    submit: "Absenden",
    retry: "Erneut versuchen",
    unavailable: "Diese Umfrage ist nicht verfügbar",
    unavailableDetail: "Die Einladung ist möglicherweise abgelaufen oder die Bestellung ist nicht berechtigt.",
    loadError: "Die Umfrage konnte nicht geladen werden.",
    answerError: "Ihre Antwort konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
    completionError: "Ihre Antworten sind gespeichert, aber der Abschluss ist fehlgeschlagen.",
    selectRequired: "Wählen Sie eine Antwort aus.",
    enterRequired: "Geben Sie eine Antwort ein.",
    consentRequired: "Bitte stimmen Sie zu, um fortzufahren.",
    copy: "Code kopieren",
    copied: "Kopiert",
    rewardPending: "Ihre Belohnung wird vorbereitet.",
    rewardExpires: "Gültig bis",
    privacy: "Harbor Innovations nutzt Ihre Antworten für Produkt- und Kundenforschung.",
  },
  es: {
    back: "Atrás",
    continue: "Continuar",
    start: "Comenzar encuesta",
    required: "Obligatorio",
    saved: "Guardado",
    saving: "Guardando...",
    submit: "Enviar",
    retry: "Intentar de nuevo",
    unavailable: "Esta encuesta no está disponible",
    unavailableDetail: "La invitación puede haber caducado o el pedido no es elegible.",
    loadError: "No pudimos cargar esta encuesta.",
    answerError: "No pudimos guardar tu respuesta. Inténtalo de nuevo.",
    completionError: "Tus respuestas estan guardadas, pero no pudimos completar la encuesta.",
    selectRequired: "Elige una respuesta para continuar.",
    enterRequired: "Escribe una respuesta para continuar.",
    consentRequired: "Acepta el consentimiento para continuar.",
    copy: "Copiar código",
    copied: "Copiado",
    rewardPending: "Estamos preparando tu recompensa.",
    rewardExpires: "Caduca",
    privacy: "Harbor Innovations usa tus respuestas para investigar productos y clientes.",
  },
};

function preferredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const search = new URLSearchParams(window.location.search);
  const requested = (search.get("lang") ?? search.get("locale"))?.toLowerCase();
  const candidate = requested || window.navigator.language.toLowerCase().split("-")[0];
  return candidate === "de" || candidate === "es" ? candidate : "en";
}

function hasValue(value: PublicValue | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Boolean(value.email?.trim() || value.phone?.trim());
  return true;
}

function conditionMatches(condition: PublicCondition, answers: Record<string, PublicValue>): boolean {
  const actual = answers[condition.questionId];
  switch (condition.operator) {
    case "is_answered": return hasValue(actual);
    case "is_not_answered": return !hasValue(actual);
    case "equals": return JSON.stringify(actual) === JSON.stringify(condition.value);
    case "not_equals": return JSON.stringify(actual) !== JSON.stringify(condition.value);
    case "contains":
      return Array.isArray(actual)
        ? actual.includes(String(condition.value))
        : typeof actual === "string" && typeof condition.value === "string" && actual.includes(condition.value);
    case "not_contains": return !conditionMatches({ ...condition, operator: "contains" }, answers);
    case "greater_than": return typeof actual === "number" && typeof condition.value === "number" && actual > condition.value;
    case "greater_than_or_equal": return typeof actual === "number" && typeof condition.value === "number" && actual >= condition.value;
    case "less_than": return typeof actual === "number" && typeof condition.value === "number" && actual < condition.value;
    case "less_than_or_equal": return typeof actual === "number" && typeof condition.value === "number" && actual <= condition.value;
    default: return false;
  }
}

function localNextQuestion(
  definition: PublicDefinition,
  question: PublicQuestion,
  answers: Record<string, PublicValue>,
): string | null {
  const matching = question.logic?.find((rule) => {
    if (!rule.when) return true;
    const matches = rule.when.conditions.map((condition) => conditionMatches(condition, answers));
    return rule.when.mode === "all" ? matches.every(Boolean) : matches.some(Boolean);
  });
  if (matching) return matching.action === "complete" ? null : matching.targetQuestionId ?? null;
  const index = definition.questions.findIndex((item) => item.id === question.id);
  return definition.questions[index + 1]?.id ?? null;
}

async function requestJson<T>(url: string, body: Record<string, unknown>, method = "POST"): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json", "x-shopoll-client": "standalone-v1" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string; code?: string; details?: unknown };
  };
  if (!response.ok) {
    const error = new Error(payload.error?.message || `Request failed (${response.status})`);
    Object.assign(error, { status: response.status, code: payload.error?.code });
    throw error;
  }
  return payload;
}

export function PublicSurveyRunner({ token }: { token: string }) {
  const [locale, setLocale] = useState<Locale>("en");
  const [survey, setSurvey] = useState<ResolveEnvelope["survey"]>();
  const [session, setSession] = useState<SessionEnvelope>();
  const [answers, setAnswers] = useState<Record<string, PublicValue>>({});
  const [currentId, setCurrentId] = useState<string>();
  const [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [eligible, setEligible] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [completion, setCompletion] = useState<CompletionEnvelope>();
  const [copied, setCopied] = useState(false);
  const requestSequence = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const autosaveTimerRef = useRef<number | undefined>(undefined);

  const definition = survey?.definition;
  const question = definition?.questions.find((item) => item.id === currentId);
  const answerable = definition?.questions.filter((item) => !["welcome", "end"].includes(item.type)) ?? [];
  const position = question ? Math.max(0, answerable.findIndex((item) => item.id === question.id)) : -1;
  const progress = position < 0 ? 0 : ((position + 1) / Math.max(1, answerable.length)) * 100;
  const t = copy[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (currentId) headingRef.current?.focus();
  }, [currentId]);

  useEffect(() => () => {
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
  }, []);

  const complete = useCallback(async (activeSession: SessionEnvelope, activeDefinition: PublicDefinition) => {
    setSaving(true);
    setError(undefined);
    try {
      const result = await requestJson<CompletionEnvelope>(
        `/api/public/sessions/${encodeURIComponent(activeSession.sessionId)}/complete`,
        {
          schemaVersion: 1,
          resumeToken: activeSession.resumeToken,
          idempotencyKey: `complete:${activeSession.sessionId}`,
        },
      );
      setCompletion({ ...result, completion: result.completion ?? activeDefinition.completion });
    } catch {
      setError(copy[activeDefinition.locale].completionError);
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    if (completion?.reward?.status !== "pending" || !session || !definition) return;
    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;

    const poll = async () => {
      if (cancelled || attempts >= 32) return;
      attempts += 1;
      try {
        const result = await requestJson<CompletionEnvelope>(
          `/api/public/sessions/${encodeURIComponent(session.sessionId)}/complete`,
          {
            schemaVersion: 1,
            resumeToken: session.resumeToken,
            idempotencyKey: `complete:${session.sessionId}`,
          },
        );
        if (cancelled) return;
        setCompletion({ ...result, completion: result.completion ?? definition.completion });
        if (result.reward?.status === "pending") {
          timer = window.setTimeout(() => void poll(), 2500);
        }
      } catch {
        if (!cancelled) timer = window.setTimeout(() => void poll(), 2500);
      }
    };

    timer = window.setTimeout(() => void poll(), 2500);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [completion?.reward?.status, definition, session]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const requestedLocale = preferredLocale();
      setLocale(requestedLocale);
      setLoading(true);
      setError(undefined);
      try {
        const resolved = await requestJson<ResolveEnvelope>("/api/public/surveys/resolve", {
          schemaVersion: 1,
          inviteToken: token,
          context: { surface: "standalone", inviteToken: token, locale: requestedLocale },
        });
        if (cancelled) return;
        if (!resolved.eligible || !resolved.survey) {
          setEligible(false);
          return;
        }
        const activeLocale = resolved.survey.definition.locale;
        setLocale(activeLocale);
        let activeSession = resolved.session;
        if (!activeSession) {
          activeSession = await requestJson<SessionEnvelope>("/api/public/sessions", {
            schemaVersion: 1,
            surveyId: resolved.survey.id,
            surveyVersionId: resolved.survey.versionId,
            placementId: resolved.placement?.id,
            inviteToken: token,
            context: { surface: "standalone", inviteToken: token, locale: activeLocale },
            idempotencyKey: `standalone:${resolved.survey.versionId}:${crypto.randomUUID()}`,
          });
        }
        if (cancelled) return;
        const restored = Object.fromEntries(
          (activeSession.answers ?? [])
            .filter((answer) => !answer.sensitive)
            .map((answer) => [answer.questionId, answer.value]),
        );
        setSurvey(resolved.survey);
        setSession(activeSession);
        setAnswers(restored);

        if (activeSession.completed || activeSession.status === "completed") {
          await complete(activeSession, resolved.survey.definition);
          return;
        }

        let nextId: string | undefined = resolved.survey.definition.startQuestionId
          ?? resolved.survey.definition.questions[0]?.id;
        const visited = new Set<string>();
        while (nextId && !visited.has(nextId)) {
          visited.add(nextId);
          const next = resolved.survey.definition.questions.find((item) => item.id === nextId);
          if (!next || next.type === "welcome" || next.type === "end" || !hasValue(restored[next.id])) break;
          nextId = localNextQuestion(resolved.survey.definition, next, restored) ?? undefined;
        }
        const next = resolved.survey.definition.questions.find((item) => item.id === nextId);
        if (!nextId || next?.type === "end") await complete(activeSession, resolved.survey.definition);
        else setCurrentId(nextId);
      } catch (loadError) {
        if (!cancelled) {
          const status = (loadError as Error & { status?: number }).status;
          if (status === 404 || status === 410) setEligible(false);
          else setError(copy[requestedLocale].loadError);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [complete, token]);

  const saveAnswer = useCallback(async (
    questionId: string,
    value?: PublicValue,
    skipped = false,
  ) => {
    if (!session || !definition) return null;
    const sequence = ++requestSequence.current;
    setSaving(true);
    setSaved(false);
    setError(undefined);
    try {
      const navigation = await requestJson<{ nextQuestionId?: string; complete?: boolean }>(
        `/api/public/sessions/${encodeURIComponent(session.sessionId)}/answers/${encodeURIComponent(questionId)}`,
        {
          schemaVersion: 1,
          questionId,
          ...(skipped ? { skipped: true } : { value }),
          resumeToken: session.resumeToken,
          idempotencyKey: `answer:${session.sessionId}:${questionId}:${skipped ? "skip" : "value"}:${crypto.randomUUID()}`,
          answeredAt: new Date().toISOString(),
        },
        "PUT",
      );
      if (sequence === requestSequence.current) {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1600);
      }
      return navigation;
    } catch {
      setError(t.answerError);
      return null;
    } finally {
      if (sequence === requestSequence.current) setSaving(false);
    }
  }, [definition, session, t.answerError]);

  const choose = (value: PublicValue) => {
    if (!question) return;
    setAnswers((current) => ({ ...current, [question.id]: value }));
    if (["single_choice", "multiple_choice", "nps", "csat", "rating", "consent"].includes(question.type)) {
      void saveAnswer(question.id, value);
    } else if (["short_text", "long_text", "contact"].includes(question.type)) {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
      const contactCanSave = question.type !== "contact"
        || (typeof value === "object" && !Array.isArray(value)
          && (value.consent === true || (!value.email && !value.phone)));
      if (contactCanSave) {
        autosaveTimerRef.current = window.setTimeout(() => {
          void saveAnswer(question.id, value);
        }, 600);
      }
    }
  };

  const goForward = async () => {
    if (!question || !definition || !session) return;
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = undefined;
    }
    if (question.type === "welcome") {
      const nextId = localNextQuestion(definition, question, answers);
      const next = definition.questions.find((item) => item.id === nextId);
      if (!nextId || next?.type === "end") await complete(session, definition);
      else {
        setHistory((current) => [...current, question.id]);
        setCurrentId(nextId);
      }
      return;
    }
    const value = answers[question.id];
    if (question.required && !hasValue(value)) {
      setError(["single_choice", "multiple_choice", "nps", "csat", "rating"].includes(question.type)
        ? t.selectRequired
        : question.type === "consent" || question.type === "contact"
          ? t.consentRequired
          : t.enterRequired);
      return;
    }
    if (question.type === "contact" && typeof value === "object" && !Array.isArray(value) && value.consent !== true) {
      setError(t.consentRequired);
      return;
    }
    const navigation = value === undefined
      ? await saveAnswer(question.id, undefined, true)
      : await saveAnswer(question.id, value);
    if (!navigation) return;
    const nextId = navigation.nextQuestionId;
    const next = definition.questions.find((item) => item.id === nextId);
    if (navigation?.complete || !nextId || next?.type === "end") {
      await complete(session, definition);
      return;
    }
    setHistory((current) => [...current, question.id]);
    setCurrentId(nextId);
    setError(undefined);
  };

  const currentValue = question ? answers[question.id] : undefined;
  const languageOptions = useMemo(() => [
    { value: "en", label: "English" },
    { value: "de", label: "Deutsch" },
    { value: "es", label: "Español" },
  ] as const, []);

  if (loading) return <SurveyState title="Shopoll" detail="Loading survey..." busy />;
  if (!eligible) return <SurveyState title={t.unavailable} detail={t.unavailableDetail} />;
  if (!survey || !definition || !session) {
    return <SurveyState title={t.loadError} detail={error} action={() => window.location.reload()} actionLabel={t.retry} />;
  }
  if (completion) {
    return (
      <SurveyShell locale={locale} onLocaleChange={() => undefined} languageOptions={languageOptions} hideLocale style={definition.style}>
        <main className="sp-live-complete" aria-live="polite">
          <span className="sp-live-complete-mark" aria-hidden="true">&#10003;</span>
          <h1 tabIndex={-1}>{completion.completion?.title || definition.completion.title}</h1>
          {completion.completion?.message || definition.completion.message ? (
            <p>{completion.completion?.message || definition.completion.message}</p>
          ) : null}
          {completion.reward?.code ? (
            <section className="sp-live-reward" aria-label="Reward">
              <span>{completion.reward.code}</span>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(completion.reward?.code ?? "");
                  setCopied(true);
                }}
              >
                {copied ? t.copied : t.copy}
              </button>
              {completion.reward.expiresAt ? (
                <small>{t.rewardExpires}: {new Date(completion.reward.expiresAt).toLocaleDateString(locale)}</small>
              ) : null}
            </section>
          ) : completion.reward?.status === "pending" ? <p>{t.rewardPending}</p> : null}
          {error ? <ErrorNotice message={error} /> : null}
        </main>
      </SurveyShell>
    );
  }
  if (!question) return <SurveyState title={t.loadError} />;

  return (
    <SurveyShell locale={locale} onLocaleChange={(next) => {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", next);
      window.location.href = url.toString();
    }} languageOptions={languageOptions} style={definition.style}>
      <div className="sp-live-progress" aria-label={`${Math.round(progress)}%`}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <main className="sp-live-body">
        <div className="sp-live-meta">
          {question.required && !["welcome", "end"].includes(question.type) ? <span>{t.required}</span> : <span />}
          {position >= 0 ? <span>{position + 1} / {answerable.length}</span> : null}
        </div>
        <div className="sp-live-question">
          <h1 ref={headingRef} tabIndex={-1}>{question.title}</h1>
          {question.description ? <p>{question.description}</p> : null}
        </div>
        <QuestionControl question={question} value={currentValue} onChange={choose} />
        {error ? <ErrorNotice message={error} /> : null}
      </main>
      <footer className="sp-live-footer">
        <button
          type="button"
          className="sp-live-back"
          disabled={history.length === 0 || saving}
          onClick={() => {
            const previous = history.at(-1);
            if (!previous) return;
            setCurrentId(previous);
            setHistory((current) => current.slice(0, -1));
            setError(undefined);
          }}
        >
          <span aria-hidden="true">&#8592;</span> {t.back}
        </button>
        <span className="sp-live-save" aria-live="polite">
          {saving ? t.saving : saved ? `\u2713 ${t.saved}` : ""}
        </span>
        <button type="button" className="sp-live-next" disabled={saving} onClick={() => void goForward()}>
          {question.buttonLabel || (question.type === "welcome" ? t.start : position === answerable.length - 1 ? t.submit : t.continue)}
          <span aria-hidden="true">&#8594;</span>
        </button>
      </footer>
    </SurveyShell>
  );
}

function QuestionControl({ question, value, onChange }: {
  question: PublicQuestion;
  value?: PublicValue;
  onChange: (value: PublicValue) => void;
}) {
  if (question.type === "welcome") return null;
  if (question.type === "single_choice" || question.type === "multiple_choice") {
    const selected = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    return (
      <div className="sp-live-options" role={question.type === "single_choice" ? "radiogroup" : "group"}>
        {question.options?.map((option) => {
          const active = selected.includes(option.id);
          return (
            <button
              type="button"
              key={option.id}
              className={active ? "is-selected" : ""}
              role={question.type === "single_choice" ? "radio" : "checkbox"}
              aria-checked={active}
              onClick={() => {
                if (question.type === "single_choice") onChange(option.id);
                else onChange(active ? selected.filter((item) => item !== option.id) : [...selected, option.id]);
              }}
            >
              <span className="sp-live-choice-mark" aria-hidden="true" />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    );
  }
  if (question.type === "nps" || question.type === "csat" || question.type === "rating") {
    const start = question.type === "nps" ? 0 : 1;
    const end = question.type === "nps"
      ? 10
      : question.type === "csat"
        ? (question.scale ?? 5)
        : (question.stars ?? 5);
    return (
      <div className="sp-live-scale-wrap">
        <div className={`sp-live-scale ${question.type === "rating" ? "is-rating" : ""}`} role="radiogroup">
          {Array.from({ length: end - start + 1 }, (_, index) => index + start).map((score) => (
            <button
              type="button"
              key={score}
              className={value === score ? "is-selected" : ""}
              role="radio"
              aria-checked={value === score}
              aria-label={String(score)}
              onClick={() => onChange(score)}
            >
              {question.type === "rating" ? <span aria-hidden="true">&#9733;</span> : score}
            </button>
          ))}
        </div>
        {question.type !== "rating" && (question.lowLabel || question.highLabel) ? (
          <div className="sp-live-scale-labels"><span>{question.lowLabel}</span><span>{question.highLabel}</span></div>
        ) : null}
      </div>
    );
  }
  if (question.type === "short_text" || question.type === "long_text") {
    const shared = {
      value: typeof value === "string" ? value : "",
      maxLength: question.maxLength,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.currentTarget.value),
    };
    return question.type === "long_text"
      ? <textarea className="sp-live-text" rows={6} placeholder={question.placeholder} {...shared} />
      : <input className="sp-live-text" type="text" placeholder={question.placeholder} {...shared} />;
  }
  if (question.type === "contact") {
    const contact = typeof value === "object" && !Array.isArray(value) ? value : {};
    const fields = question.collect?.length ? question.collect : [question.contactKind ?? "email"];
    return (
      <div className="sp-live-contact">
        {fields.map((kind) => (
          <input
            key={kind}
            className="sp-live-text"
            type={kind === "email" ? "email" : "tel"}
            autoComplete={kind}
            aria-label={kind === "email" ? "Email" : "Phone"}
            value={contact[kind] ?? ""}
            onChange={(event) => onChange({ ...contact, [kind]: event.currentTarget.value })}
          />
        ))}
        <label>
          <input
            type="checkbox"
            checked={contact.consent === true}
            onChange={(event) => onChange(
              event.currentTarget.checked ? { ...contact, consent: true } : { consent: false },
            )}
          />
          <span>{question.consentText}</span>
        </label>
      </div>
    );
  }
  if (question.type === "consent") {
    return (
      <label className="sp-live-consent">
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.currentTarget.checked)} />
        <span>{question.description || question.title}</span>
      </label>
    );
  }
  return null;
}

function SurveyShell({ locale, onLocaleChange, languageOptions, hideLocale = false, style, children }: {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  languageOptions: readonly { value: Locale; label: string }[];
  hideLocale?: boolean;
  style?: PublicDefinition["style"];
  children: React.ReactNode;
}) {
  return (
    <div
      className={`sp-live-page ${style?.density === "compact" ? "is-compact" : ""}`}
      style={{
        "--poll-accent": style?.accentColor ?? "#167b5b",
        "--poll-radius": `${Math.max(0, Math.min(8, style?.borderRadius ?? 4))}px`,
      } as React.CSSProperties}
    >
      <header className="sp-live-header">
        {style?.showBrand !== false ? <a href="https://shop.harborinno.com" aria-label="Harbor Innovations store">HARBOR INNOVATIONS</a> : <span />}
        {!hideLocale ? (
          <select aria-label="Language" value={locale} onChange={(event) => onLocaleChange(event.currentTarget.value as Locale)}>
            {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        ) : null}
      </header>
      <section className="sp-live-panel">{children}</section>
      <p className="sp-live-privacy">{copy[locale].privacy}</p>
    </div>
  );
}

function ErrorNotice({ message }: { message: string }) {
  return <div className="sp-live-error" role="alert">{message}</div>;
}

function SurveyState({ title, detail, busy = false, action, actionLabel }: {
  title: string;
  detail?: string;
  busy?: boolean;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="sp-live-state">
      <div className="sp-live-state-brand">HARBOR INNOVATIONS</div>
      {busy ? <span className="sp-live-spinner" aria-hidden="true" /> : null}
      <h1>{title}</h1>
      {detail ? <p>{detail}</p> : null}
      {action ? <button type="button" onClick={action}>{actionLabel}</button> : null}
    </div>
  );
}
