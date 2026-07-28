import type {
  AnalyticsSession,
  AnalyticsSummary,
  MetricComparison,
  SurveyDefinitionV1,
  WeeklyComparison,
  WeeklyMetricSnapshot,
} from "./types";

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateRate(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : round(numerator / denominator, 4);
}

export function calculateNps(scores: readonly number[]): number | null {
  const valid = scores.filter((score) => Number.isInteger(score) && score >= 0 && score <= 10);
  if (valid.length === 0) return null;
  const promoters = valid.filter((score) => score >= 9).length;
  const detractors = valid.filter((score) => score <= 6).length;
  return round(((promoters - detractors) / valid.length) * 100, 1);
}

export function calculateCsat(
  scores: readonly number[],
  scale: 5 | 7 = 5,
): number | null {
  const valid = scores.filter(
    (score) => Number.isInteger(score) && score >= 1 && score <= scale,
  );
  if (valid.length === 0) return null;
  const satisfiedThreshold = scale === 5 ? 4 : 6;
  const satisfied = valid.filter((score) => score >= satisfiedThreshold).length;
  return round((satisfied / valid.length) * 100, 1);
}

export interface ChoiceAnswerCount {
  optionId: string;
  count: number;
  share: number;
}

export function rankChoiceAnswers(
  sessions: readonly AnalyticsSession[],
  questionId: string,
): readonly ChoiceAnswerCount[] {
  const counts = new Map<string, number>();
  let totalSelections = 0;

  for (const session of sessions) {
    const answer = session.answers.find((item) => item.questionId === questionId);
    if (!answer) continue;
    const optionIds = Array.isArray(answer.value) ? answer.value : [answer.value];
    for (const optionId of optionIds) {
      if (typeof optionId !== "string") continue;
      counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
      totalSelections += 1;
    }
  }

  return [...counts.entries()]
    .map(([optionId, count]) => ({
      optionId,
      count,
      share: calculateRate(count, totalSelections),
    }))
    .sort((left, right) => right.count - left.count || left.optionId.localeCompare(right.optionId));
}

export interface QuestionFunnelStep {
  questionId: string;
  answers: number;
  shareOfStarts: number;
  dropoffFromPrevious: number;
}

export function calculateQuestionFunnel(
  definition: SurveyDefinitionV1,
  sessions: readonly AnalyticsSession[],
): readonly QuestionFunnelStep[] {
  const answerableQuestions = definition.questions.filter(
    (question) => question.kind !== "welcome" && question.kind !== "end",
  );
  let previous = sessions.length;
  return answerableQuestions.map((question) => {
    const answers = sessions.filter((session) =>
      session.answers.some((answer) => answer.questionId === question.id),
    ).length;
    const step = {
      questionId: question.id,
      answers,
      shareOfStarts: calculateRate(answers, sessions.length),
      dropoffFromPrevious: calculateRate(Math.max(0, previous - answers), previous),
    };
    previous = answers;
    return step;
  });
}

export function buildAnalyticsSummary(
  definition: SurveyDefinitionV1,
  sessions: readonly AnalyticsSession[],
  impressions: number,
): AnalyticsSummary {
  const completed = sessions.filter((session) => Boolean(session.completedAt));
  const partials = sessions.filter(
    (session) => !session.completedAt && session.answers.length > 0,
  ).length;

  const completionSeconds = completed.flatMap((session) => {
    const start = Date.parse(session.startedAt);
    const finish = Date.parse(session.completedAt ?? "");
    return Number.isFinite(start) && Number.isFinite(finish) && finish >= start
      ? [(finish - start) / 1000]
      : [];
  });

  const npsQuestionIds = new Set(
    definition.questions.filter((question) => question.kind === "nps").map((question) => question.id),
  );
  const csatQuestions = new Map(
    definition.questions
      .filter((question) => question.kind === "csat")
      .map((question) => [question.id, question.scale] as const),
  );
  const npsScores: number[] = [];
  const csatPercentages: number[] = [];

  for (const session of sessions) {
    for (const answer of session.answers) {
      if (npsQuestionIds.has(answer.questionId) && typeof answer.value === "number") {
        npsScores.push(answer.value);
      }
      const scale = csatQuestions.get(answer.questionId);
      if (scale && typeof answer.value === "number") {
        const score = calculateCsat([answer.value], scale);
        if (score !== null) csatPercentages.push(score);
      }
    }
  }

  const orders = sessions.filter((session) => session.orderRevenue !== undefined);
  const attributedRevenue = round(
    orders.reduce((sum, session) => sum + (session.orderRevenue ?? 0), 0),
  );

  return {
    impressions: Math.max(0, Math.trunc(impressions)),
    starts: sessions.length,
    partials,
    completions: completed.length,
    startRate: calculateRate(sessions.length, impressions),
    completionRate: calculateRate(completed.length, sessions.length),
    averageCompletionSeconds:
      completionSeconds.length === 0
        ? null
        : round(
            completionSeconds.reduce((sum, seconds) => sum + seconds, 0) /
              completionSeconds.length,
            1,
          ),
    nps: calculateNps(npsScores),
    csat:
      csatPercentages.length === 0
        ? null
        : round(
            csatPercentages.reduce((sum, percentage) => sum + percentage, 0) /
              csatPercentages.length,
            1,
          ),
    attributedOrders: orders.length,
    attributedRevenue,
    attributedAov: orders.length === 0 ? null : round(attributedRevenue / orders.length),
  };
}

export function toWeeklyMetricSnapshot(summary: AnalyticsSummary): WeeklyMetricSnapshot {
  return {
    impressions: summary.impressions,
    starts: summary.starts,
    completions: summary.completions,
    completionRate: summary.completionRate,
    nps: summary.nps,
    csat: summary.csat,
    attributedOrders: summary.attributedOrders,
    attributedRevenue: summary.attributedRevenue,
  };
}

export function compareMetric(
  current: number | null,
  previous: number | null,
): MetricComparison {
  if (current === null || previous === null) {
    return { current, previous, absoluteChange: null, percentChange: null };
  }

  const absoluteChange = round(current - previous);
  const percentChange =
    previous === 0 ? (current === 0 ? 0 : null) : round((absoluteChange / Math.abs(previous)) * 100, 1);
  return { current, previous, absoluteChange, percentChange };
}

export function compareWeeklyMetrics(
  current: WeeklyMetricSnapshot,
  previous: WeeklyMetricSnapshot,
): WeeklyComparison {
  return {
    impressions: compareMetric(current.impressions, previous.impressions),
    starts: compareMetric(current.starts, previous.starts),
    completions: compareMetric(current.completions, previous.completions),
    completionRate: compareMetric(current.completionRate, previous.completionRate),
    nps: compareMetric(current.nps, previous.nps),
    csat: compareMetric(current.csat, previous.csat),
    attributedOrders: compareMetric(current.attributedOrders, previous.attributedOrders),
    attributedRevenue: compareMetric(current.attributedRevenue, previous.attributedRevenue),
  };
}
