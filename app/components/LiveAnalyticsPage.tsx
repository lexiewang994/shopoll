import { useState, type ReactNode } from "react";

import { useAdminI18n } from "./AdminI18n";
import type { LiveAnalyticsView, LiveBarRow } from "./live-admin-types";
import {
  HorizontalBars,
  MetricCard,
  Notice,
  PageHeader,
  Panel,
  Segmented,
  SparkBars,
} from "./ShopollUi";

type Breakdown = "motivation" | "channel" | "barrier";

function BarsOrEmpty({ rows }: { rows: LiveBarRow[] }) {
  const { t } = useAdminI18n();
  return rows.length ? (
    <HorizontalBars rows={rows} />
  ) : (
    <p className="sp-muted">{t("当前筛选范围内没有有效选择题回答。")}</p>
  );
}

export function LiveAnalyticsPage({
  data,
  current,
  exportAction,
}: {
  data: LiveAnalyticsView;
  current: Record<string, string>;
  exportAction?: ReactNode;
}) {
  const { t, number, money } = useAdminI18n();
  const [breakdown, setBreakdown] = useState<Breakdown>("motivation");
  const rows =
    breakdown === "motivation"
      ? data.motivation
      : breakdown === "channel"
        ? data.channel
        : data.barrier;
  const summary = data.summary;
  const maxNps = Math.max(...data.npsHistogram, 1);

  return (
    <div className="sp-page-content">
      <PageHeader
        title={t("分析")}
        description={t(
          "连接调研回答与去标识化订单事实，定位动机、渠道和阻碍。",
        )}
        actions={exportAction}
      />

      <form method="get" className="sp-analytics-filters">
        <FilterSelect
          name="surveyId"
          label={t("问卷")}
          value={current.surveyId}
          all={t("所有问卷")}
          options={data.options.surveys}
        />
        <FilterSelect
          name="productGid"
          label={t("产品")}
          value={current.productGid}
          all={t("所有产品")}
          options={data.options.products}
        />
        <FilterSelect
          name="variantGid"
          label={t("变体")}
          value={current.variantGid}
          all={t("所有变体")}
          options={data.options.variants}
        />
        <FilterSelect
          name="market"
          label={t("市场")}
          value={current.market}
          all={t("所有市场")}
          options={data.options.markets}
        />
        <FilterSelect
          name="locale"
          label={t("语言")}
          value={current.locale}
          all={t("所有语言")}
          options={data.options.locales}
        />
        <FilterSelect
          name="source"
          label={t("来源")}
          value={current.source}
          all={t("所有来源")}
          options={data.options.sources}
        />
        <FilterSelect
          name="utmSource"
          label={t("UTM 来源")}
          value={current.utmSource}
          all={t("所有 UTM 来源")}
          options={data.options.utmSources}
        />
        <FilterSelect
          name="utmMedium"
          label={t("UTM 媒介")}
          value={current.utmMedium}
          all={t("所有 UTM 媒介")}
          options={data.options.utmMediums}
        />
        <FilterSelect
          name="utmCampaign"
          label={t("UTM Campaign")}
          value={current.utmCampaign}
          all={t("所有 UTM Campaign")}
          options={data.options.utmCampaigns}
        />
        <select
          aria-label={t("客户类型")}
          name="customerType"
          defaultValue={current.customerType ?? ""}
        >
          <option value="">{t("所有客户")}</option>
          <option value="new">{t("新客户")}</option>
          <option value="returning">{t("老客户")}</option>
        </select>
        <input
          aria-label={t("开始日期")}
          name="dateFrom"
          type="date"
          defaultValue={current.dateFrom || data.dateFrom}
        />
        <input
          aria-label={t("结束日期")}
          name="dateTo"
          type="date"
          defaultValue={current.dateTo || data.dateTo}
        />
        <button type="submit" className="sp-button">
          {t("应用筛选")}
        </button>
        <a href="/app/analytics" className="sp-link-button">
          {t("重置")}
        </a>
      </form>

      <div className="sp-active-filter-row">
        <span>
          {t("{from} 至 {to}", { from: data.dateFrom, to: data.dateTo })}
        </span>
        {data.truncated ? (
          <strong className="sp-negative">
            {t(
              "数据量超过 10,000 个会话，当前视图仅显示最近部分；CSV 不受此限制。",
            )}
          </strong>
        ) : null}
      </div>

      <div className="sp-metrics-grid sp-metrics-5">
        <MetricCard label={t("曝光")} value={number(summary.impressions)} />
        <MetricCard
          label={t("开始")}
          value={number(summary.starts)}
          detail={t("{rate}% 开始率", {
            rate: (summary.startRate * 100).toFixed(1),
          })}
        />
        <MetricCard label={t("部分回答")} value={number(summary.partials)} />
        <MetricCard
          label={t("完成率")}
          value={`${(summary.completionRate * 100).toFixed(1)}%`}
          detail={t("{count} 份完成", { count: number(summary.completions) })}
        />
        <MetricCard
          label="NPS"
          value={
            summary.nps === null
              ? "—"
              : `${summary.nps > 0 ? "+" : ""}${summary.nps}`
          }
          detail={
            summary.csat === null ? t("暂无 CSAT") : `CSAT ${summary.csat}%`
          }
        />
      </div>

      <div className="sp-grid sp-grid-2-1">
        <Panel title={t("完成趋势")} description={t("按天 · 完整回答")}>
          <div className="sp-trend-summary">
            <div>
              <strong>{number(summary.completions)}</strong>
              <span>{t("完整回答")}</span>
            </div>
            <div>
              <strong>{number(summary.partials)}</strong>
              <span>{t("部分回答")}</span>
            </div>
            <div>
              <strong>
                {number(Math.max(...data.trend.map((point) => point.value), 0))}
              </strong>
              <span>{t("单日峰值")}</span>
            </div>
          </div>
          <SparkBars values={data.trend.map((point) => point.value)} />
          <div className="sp-axis">
            <span>{data.trend[0]?.label ?? data.dateFrom}</span>
            <span>{data.trend.at(-1)?.label ?? data.dateTo}</span>
          </div>
        </Panel>
        <Panel
          title={t("完成漏斗")}
          description={t("开始后的比例以开始会话为分母")}
        >
          <div className="sp-funnel">
            {data.funnel.map((step, index) => (
              <div key={step.label}>
                <span>{t(step.label)}</span>
                <div>
                  <span style={{ width: `${Math.min(100, step.rate)}%` }} />
                </div>
                <strong>{number(step.value)}</strong>
                <small>{index === 0 ? "100%" : `${step.rate}%`}</small>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="sp-grid sp-grid-2">
        <Panel
          title={t("客户自报洞察")}
          description={t("选择项占该维度有效回答的比例")}
          action={
            <Segmented
              value={breakdown}
              onChange={(value) => setBreakdown(value as Breakdown)}
              label={t("分析维度")}
              options={[
                { value: "motivation", label: t("动机") },
                { value: "channel", label: t("渠道") },
                { value: "barrier", label: t("阻碍") },
              ]}
            />
          }
        >
          <BarsOrEmpty rows={rows} />
        </Panel>
        <Panel title={t("按产品对比")} description={t("各产品前三购买动机")}>
          <div className="sp-product-breakdown">
            {data.productBreakdowns.map((product) => (
              <section key={product.product}>
                <header>
                  <strong>{product.product}</strong>
                  <span>
                    {t("{count} 份相关会话", { count: number(product.total) })}
                  </span>
                </header>
                {product.rows.length ? (
                  product.rows.map((row) => (
                    <div key={row.label}>
                      <span>{row.label}</span>
                      <div>
                        <span style={{ width: `${row.value}%` }} />
                      </div>
                      <strong>{row.value}%</strong>
                    </div>
                  ))
                ) : (
                  <p className="sp-muted">{t("暂无数据")}</p>
                )}
              </section>
            ))}
          </div>
        </Panel>
      </div>

      <div className="sp-grid sp-grid-2">
        <Panel
          title={t("NPS 分布")}
          description={t("{count} 份有效评分", {
            count: number(data.npsResponses),
          })}
        >
          <div className="sp-nps-head">
            <div>
              <strong>
                {summary.nps === null
                  ? "—"
                  : `${summary.nps > 0 ? "+" : ""}${summary.nps}`}
              </strong>
              <span>NPS</span>
            </div>
          </div>
          <div className="sp-histogram" aria-label={t("NPS 0 到 10 分布")}>
            {data.npsHistogram.map((value, score) => (
              <div key={score}>
                <span
                  style={{ height: `${(value / maxNps) * 100}%` }}
                  className={
                    score <= 6
                      ? "is-negative"
                      : score <= 8
                        ? "is-neutral"
                        : "is-positive"
                  }
                />
                <small>{score}</small>
              </div>
            ))}
          </div>
        </Panel>
        <Panel
          title={t("订单与收入")}
          description={t("回答与订单事实的相关关系")}
        >
          <Notice tone="warning" title={t("相关性，不代表因果")}>
            {t("这些数字用于比较回答分组，不能证明问卷触达导致了购买。")}
          </Notice>
          <div className="sp-correlation-metrics">
            <div>
              <span>{t("相关订单")}</span>
              <strong>{number(summary.attributedOrders)}</strong>
            </div>
            <div>
              <span>{t("相关收入")}</span>
              <strong>
                {money(summary.attributedRevenue, summary.currency)}
              </strong>
            </div>
            <div>
              <span>{t("相关 AOV")}</span>
              <strong>
                {summary.attributedAov === null
                  ? "—"
                  : money(summary.attributedAov, summary.currency)}
              </strong>
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title={t("逐题流失")}
        description={t("按发布版本冻结的题目快照计算")}
      >
        <div className="sp-table-wrap">
          <table className="sp-table">
            <thead>
              <tr>
                <th>{t("题目")}</th>
                <th>{t("回答")}</th>
                <th>{t("占开始会话")}</th>
                <th>{t("相对上一题流失")}</th>
              </tr>
            </thead>
            <tbody>
              {data.questionDropoff.length ? (
                data.questionDropoff.map((row, index) => (
                  <tr key={`${row.question}-${index}`}>
                    <td>
                      <strong>{row.question}</strong>
                    </td>
                    <td>{number(row.answered)}</td>
                    <td>{row.shareOfStarts}%</td>
                    <td>{row.dropoff}%</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="sp-muted">
                    {t("暂无逐题数据")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function FilterSelect({
  name,
  label,
  value,
  all,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  all: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select aria-label={label} name={name} defaultValue={value ?? ""}>
      <option value="">{all}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
