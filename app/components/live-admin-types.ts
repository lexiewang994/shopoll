export interface LiveMetricSummary {
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
  currency: string;
}

export interface LiveBarRow {
  label: string;
  value: number;
  count: number;
  color?: string;
}

export interface LiveTrendPoint {
  label: string;
  value: number;
}

export interface LiveFunnelStep {
  label: string;
  value: number;
  rate: number;
}

export interface LiveQuestionDropoff {
  question: string;
  answered: number;
  shareOfStarts: number;
  dropoff: number;
}

export interface LiveProductBreakdown {
  product: string;
  total: number;
  rows: LiveBarRow[];
}

export interface LiveFilterOption {
  value: string;
  label: string;
}

export interface LiveAnalyticsView {
  summary: LiveMetricSummary;
  dateFrom: string;
  dateTo: string;
  trend: LiveTrendPoint[];
  funnel: LiveFunnelStep[];
  motivation: LiveBarRow[];
  channel: LiveBarRow[];
  barrier: LiveBarRow[];
  productBreakdowns: LiveProductBreakdown[];
  npsHistogram: number[];
  npsResponses: number;
  questionDropoff: LiveQuestionDropoff[];
  options: {
    surveys: LiveFilterOption[];
    products: LiveFilterOption[];
    variants: LiveFilterOption[];
    markets: LiveFilterOption[];
    locales: LiveFilterOption[];
    sources: LiveFilterOption[];
    utmSources: LiveFilterOption[];
    utmMediums: LiveFilterOption[];
    utmCampaigns: LiveFilterOption[];
  };
  truncated: boolean;
}

export interface LiveResponseAnswer {
  question: string;
  value: string;
}

export interface LiveResponseRow {
  id: string;
  survey: string;
  version: number;
  product: string;
  market: string;
  locale: string;
  source: string;
  status: string;
  answered: number;
  totalQuestions: number;
  durationSeconds: number | null;
  hasOrder: boolean;
  revenue: number | null;
  currency: string;
  createdAt: string;
  surface: string;
  answers: LiveResponseAnswer[];
}

export interface LiveDashboardView {
  analytics: LiveAnalyticsView;
  health: {
    surveyCount: number;
    activeSurveyCount: number;
    enabledPlacements: number;
    failedEvents: number;
    failedRewards: number;
    klaviyoConfigured: boolean;
    flowConfigured: boolean;
  };
  rollout: {
    enabled: boolean;
    sampleRate: number;
    rewardsEnabled: boolean;
  } | null;
}

export interface LiveIntegrationEventRow {
  event: string;
  status: string;
  count: number;
  lastAt: string | null;
}

export interface LiveIntegrationsView {
  klaviyoConfigured: boolean;
  flowConfigured: boolean;
  allowedFlowCount: number;
  weeklyReportsEnabled: boolean;
  events: LiveIntegrationEventRow[];
  placements: Array<{ surface: string; enabled: number; total: number }>;
}

export interface LiveSettingsView {
  shop: {
    domain: string;
    adminLocale: string;
    defaultSurveyLocale: string;
    contactQuestionsEnabled: boolean;
    timezone: string;
    retentionDays: number;
    sensitiveRetentionDays: number;
  };
  reports: Array<{
    id: string;
    email: string;
    locale: string;
    timezone: string;
    weekday: number;
    hour: number;
    enabled: boolean;
  }>;
  integrations: {
    klaviyo: boolean;
    klaviyoFlow: boolean;
    encryption: boolean;
  };
  privacyExports: Array<{
    id: string;
    requestHash: string;
    createdAt: string;
    expiresAt: string;
  }>;
}
