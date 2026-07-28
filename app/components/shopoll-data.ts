import { HARBOR_SURVEY_TEMPLATES } from "../data";
import type { QuestionKind, SurveyDefinitionV1 } from "../domain";

export type SurveyState = "active" | "draft" | "paused";

export interface SurveyRow {
  id: string;
  name: string;
  category: string;
  channel: string;
  status: SurveyState;
  responses: number;
  completionRate: number;
  updatedAt: string;
  priority: number;
}

export interface QuestionDraft {
  id: string;
  kind: QuestionKind;
  title: string;
  required: boolean;
  options?: string[];
}

export const SURVEY_ROWS: SurveyRow[] = [
  {
    id: "purchase-motivation",
    name: "购买动机 · 核心产品",
    category: "购买动机",
    channel: "Thank you",
    status: "active",
    responses: 428,
    completionRate: 74.2,
    updatedAt: "今天 10:24",
    priority: 100,
  },
  {
    id: "product-page-barrier",
    name: "商品页购买障碍",
    category: "购买障碍",
    channel: "商品页弹层",
    status: "active",
    responses: 186,
    completionRate: 42.8,
    updatedAt: "昨天 17:40",
    priority: 80,
  },
  {
    id: "cart-exit",
    name: "购物车退出原因",
    category: "退出意图",
    channel: "购物车弹层",
    status: "paused",
    responses: 93,
    completionRate: 51.6,
    updatedAt: "7月24日",
    priority: 90,
  },
  {
    id: "post-delivery-nps",
    name: "交付后 NPS",
    category: "NPS",
    channel: "Klaviyo",
    status: "draft",
    responses: 0,
    completionRate: 0,
    updatedAt: "7月23日",
    priority: 60,
  },
  {
    id: "product-satisfaction",
    name: "产品满意度",
    category: "满意度",
    channel: "独立链接",
    status: "draft",
    responses: 0,
    completionRate: 0,
    updatedAt: "7月22日",
    priority: 50,
  },
];

export const TEMPLATE_META: Record<
  SurveyDefinitionV1["category"],
  { label: string; channel: string; description: string }
> = {
  purchase_motivation: {
    label: "购买动机",
    channel: "Thank you / 订单状态",
    description: "按订单中的核心产品自动分流，收集动机、认知渠道和购买阻碍。",
  },
  purchase_barrier: {
    label: "购买障碍",
    channel: "商品页弹层",
    description: "在犹豫阶段识别价格、兼容性、物流和信任问题。",
  },
  cart_exit: {
    label: "购物车退出",
    channel: "退出意图",
    description: "桌面端退出意图，移动端自动切换为停留或滚动触发。",
  },
  abandoned_cart: {
    label: "弃购跟进",
    channel: "Klaviyo 邮件 / SMS",
    description: "通过 Flow webhook 生成安全邀请链接，了解未完成结账原因。",
  },
  post_delivery_nps: {
    label: "交付后 NPS",
    channel: "Klaviyo 邮件 / SMS",
    description: "交付后衡量推荐意愿，并根据分数追问改进点或亮点。",
  },
  product_satisfaction: {
    label: "产品满意度",
    channel: "独立链接",
    description: "组合星级和 CSAT，收集具体产品体验。",
  },
  standalone: {
    label: "通用独立调查",
    channel: "独立链接",
    description: "从克制的通用模板开始，自由增删题目和逻辑。",
  },
};

export const TEMPLATE_OPTIONS = HARBOR_SURVEY_TEMPLATES.map((definition) => ({
  definition,
  ...TEMPLATE_META[definition.category],
}));

export const DEFAULT_QUESTIONS: QuestionDraft[] = [
  {
    id: "welcome",
    kind: "welcome",
    title: "感谢你选择 Harbor Innovations",
    required: false,
  },
  {
    id: "core_product",
    kind: "single_choice",
    title: "本次购买的主要产品是什么？",
    required: true,
    options: ["Paper7", "Bricbloc", "Nexus"],
  },
  {
    id: "purchase_reason",
    kind: "single_choice",
    title: "你今天选择这个产品最主要的原因是什么？",
    required: true,
    options: ["核心功能", "隐私与本地化", "评价推荐", "价格促销", "其他"],
  },
  {
    id: "discovery_source",
    kind: "single_choice",
    title: "你最早在哪里知道 Harbor Innovations？",
    required: true,
    options: ["搜索引擎", "社交媒体", "视频或创作者", "朋友或同事", "其他"],
  },
  {
    id: "purchase_barrier",
    kind: "single_choice",
    title: "什么因素最差点让你没有下单？",
    required: true,
    options: ["价格", "产品不确定性", "兼容性", "物流", "没有阻碍", "其他"],
  },
  {
    id: "end",
    kind: "end",
    title: "感谢你的反馈。",
    required: false,
  },
];

export const RESPONSE_ROWS = [
  {
    id: "R-1048",
    survey: "购买动机 · 核心产品",
    product: "Paper7",
    market: "US",
    locale: "en",
    source: "Google",
    status: "已完成",
    answered: "5/5",
    duration: "00:42",
    order: "#H10492",
    revenue: "$549",
    date: "今天 10:21",
  },
  {
    id: "R-1047",
    survey: "购买动机 · 核心产品",
    product: "Nexus",
    market: "DE",
    locale: "de",
    source: "YouTube",
    status: "部分回答",
    answered: "3/5",
    duration: "—",
    order: "#H10491",
    revenue: "$1,899",
    date: "今天 09:46",
  },
  {
    id: "R-1046",
    survey: "商品页购买障碍",
    product: "Bricbloc",
    market: "ES",
    locale: "es",
    source: "Reddit",
    status: "已完成",
    answered: "2/2",
    duration: "00:31",
    order: "—",
    revenue: "—",
    date: "今天 08:32",
  },
  {
    id: "R-1045",
    survey: "购买动机 · 核心产品",
    product: "Bricbloc",
    market: "US",
    locale: "en",
    source: "Direct",
    status: "已完成",
    answered: "5/5",
    duration: "00:37",
    order: "#H10487",
    revenue: "$189",
    date: "昨天 23:18",
  },
  {
    id: "R-1044",
    survey: "购物车退出原因",
    product: "Paper7",
    market: "CA",
    locale: "en",
    source: "Meta",
    status: "已完成",
    answered: "2/2",
    duration: "00:28",
    order: "—",
    revenue: "—",
    date: "昨天 20:05",
  },
  {
    id: "R-1043",
    survey: "购买动机 · 核心产品",
    product: "Paper7",
    market: "US",
    locale: "en",
    source: "YouTube",
    status: "已完成",
    answered: "5/5",
    duration: "00:45",
    order: "#H10482",
    revenue: "$629",
    date: "昨天 16:44",
  },
];

export const MOTIVATION_DATA = [
  { label: "零蓝光 / 护眼", value: 31, count: 92, color: "green" },
  { label: "本地 AI 与隐私", value: 23, count: 68, color: "blue" },
  { label: "充电 / 存储 / 扩展", value: 18, count: 54, color: "cyan" },
  { label: "评价或推荐", value: 16, count: 47, color: "amber" },
  { label: "价格或促销", value: 12, count: 36, color: "gray" },
];

export const CHANNEL_DATA = [
  { label: "YouTube / 创作者", value: 29, count: 124 },
  { label: "搜索引擎", value: 24, count: 103 },
  { label: "Reddit / 社区", value: 21, count: 90 },
  { label: "朋友或同事", value: 15, count: 64 },
  { label: "媒体评测", value: 11, count: 47 },
];

export const BARRIER_DATA = [
  { label: "价格", value: 27, count: 116 },
  { label: "产品不确定性", value: 22, count: 94 },
  { label: "物流时间或费用", value: 19, count: 81 },
  { label: "兼容性", value: 17, count: 73 },
  { label: "退货或保修", value: 15, count: 64 },
];

export const FUNNEL_DATA = [
  { label: "曝光", value: 5840, rate: 100 },
  { label: "开始", value: 1248, rate: 21.4 },
  { label: "回答第 1 题", value: 1094, rate: 87.7 },
  { label: "回答第 2 题", value: 986, rate: 79 },
  { label: "完成", value: 874, rate: 70 },
];

export const TIME_SERIES = [
  42, 48, 45, 58, 56, 64, 61, 67, 72, 69, 78, 74, 81, 85,
];

export const QUESTION_KIND_LABELS: Record<QuestionKind, string> = {
  single_choice: "单选",
  multiple_choice: "多选",
  short_text: "短文本",
  long_text: "长文本",
  nps: "NPS",
  csat: "CSAT",
  star_rating: "星级",
  contact: "联系方式",
  consent: "同意框",
  welcome: "欢迎页",
  end: "结束页",
};
