import type { ReactNode } from "react";

import { useAdminI18n } from "./AdminI18n";
import type { LiveBarRow, LiveDashboardView } from "./live-admin-types";
import {
  HorizontalBars,
  MetricCard,
  Notice,
  PageHeader,
  Panel,
  SparkBars,
  StatusBadge,
} from "./ShopollUi";

function duration(value: number | null): string {
  if (value === null) return "—";
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function BarsOrEmpty({ rows }: { rows: LiveBarRow[] }) {
  const { t } = useAdminI18n();
  return rows.length ? (
    <HorizontalBars rows={rows.slice(0, 5)} />
  ) : (
    <p className="sp-muted">{t("当前筛选范围内还没有有效回答")}</p>
  );
}

export function LiveDashboardPage({
  data,
  createAction,
  settingsAction,
}: {
  data: LiveDashboardView;
  createAction?: ReactNode;
  settingsAction?: ReactNode;
}) {
  const { t, number, money } = useAdminI18n();
  const { analytics, health, rollout } = data;
  const summary = analytics.summary;
  const rolloutPercent = rollout ? Math.round(rollout.sampleRate * 100) : 0;

  return (
    <div className="sp-page-content">
      <PageHeader
        eyebrow="shop.harborinno.com"
        title={t("概览")}
        description={t("实时理解客户为何选择 Paper7、Bricbloc 与 Nexus。")}
        actions={createAction}
      />

      <Notice
        tone={rollout?.enabled ? "info" : "warning"}
        title={
          rollout?.enabled
            ? t("购买动机问卷正在 {percent}% 流量运行", {
                percent: rolloutPercent,
              })
            : t("所有购买动机触达仍处于关闭状态")
        }
      >
        {rollout?.enabled
          ? t(
              rollout.rewardsEnabled
                ? "奖励已开启；升量前请检查完成漏斗和失败事件。"
                : "奖励关闭；升量前请检查完成漏斗和失败事件。",
            )
          : t(
              "发布问卷不会自动打开 placement，请在编辑器中确认受众、抽样和频控后再启用。",
            )}
      </Notice>

      <Panel
        title={t("上线与健康检查")}
        description={t("{surveys} 个已发布问卷 · {placements} 个启用触达", {
          surveys: health.activeSurveyCount,
          placements: health.enabledPlacements,
        })}
      >
        <div className="sp-check-grid">
          <SetupItem
            done
            label={t("Shopify App 已安装")}
            detail={t("Admin session token 验证正常")}
          />
          <SetupItem
            done={health.enabledPlacements > 0}
            label={t("客户触达")}
            detail={
              health.enabledPlacements
                ? t("{count} 个 placement 已启用", {
                    count: health.enabledPlacements,
                  })
                : t("尚未启用 placement")
            }
          />
          <SetupItem
            done={health.klaviyoConfigured && health.flowConfigured}
            label="Klaviyo"
            detail={
              health.klaviyoConfigured && health.flowConfigured
                ? t("API 与 Flow webhook 已配置")
                : t("需要配置 API key / Flow secret")
            }
            action={settingsAction}
          />
          <SetupItem
            done={health.failedEvents === 0 && health.failedRewards === 0}
            label={t("后台任务")}
            detail={t("{events} 个事件失败 · {rewards} 个奖励失败（24h）", {
              events: health.failedEvents,
              rewards: health.failedRewards,
            })}
          />
        </div>
      </Panel>

      <div className="sp-toolbar sp-toolbar-compact">
        <span className="sp-muted">
          {t("{from} 至 {to}", {
            from: analytics.dateFrom,
            to: analytics.dateTo,
          })}
        </span>
        <a className="sp-link-button" href="/app/analytics">
          {t("打开完整筛选")}
        </a>
      </div>

      <div className="sp-metrics-grid">
        <MetricCard
          label={t("问卷曝光")}
          value={number(summary.impressions)}
          detail={t("当前 30 天窗口")}
        />
        <MetricCard
          label={t("开始率")}
          value={`${(summary.startRate * 100).toFixed(1)}%`}
          detail={t("{count} 次开始", { count: number(summary.starts) })}
        />
        <MetricCard
          label={t("完成率")}
          value={`${(summary.completionRate * 100).toFixed(1)}%`}
          detail={t("{count} 份完成", { count: number(summary.completions) })}
        />
        <MetricCard
          label={t("平均完成时长")}
          value={duration(summary.averageCompletionSeconds)}
          detail={t("{count} 份部分回答", { count: number(summary.partials) })}
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
        <MetricCard
          label={t("相关订单收入")}
          value={money(summary.attributedRevenue, summary.currency, 0)}
          detail={t("{count} 单 · 仅相关性", {
            count: number(summary.attributedOrders),
          })}
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
              <strong>{number(analytics.trend.at(-1)?.value ?? 0)}</strong>
              <span>{t("最近一天完成")}</span>
            </div>
          </div>
          <SparkBars values={analytics.trend.map((point) => point.value)} />
          <div className="sp-axis">
            <span>{analytics.trend[0]?.label ?? analytics.dateFrom}</span>
            <span>{analytics.trend.at(-1)?.label ?? analytics.dateTo}</span>
          </div>
        </Panel>
        <Panel title={t("系统健康")} description={t("过去 24 小时")}>
          <div className="sp-health-list">
            <HealthRow
              label={t("问卷配置")}
              value={number(health.surveyCount)}
              tone="success"
            />
            <HealthRow
              label={t("启用触达")}
              value={number(health.enabledPlacements)}
              tone={health.enabledPlacements ? "success" : "neutral"}
            />
            <HealthRow
              label={t("Klaviyo 事件")}
              value={t("{count} 失败", { count: health.failedEvents })}
              tone={health.failedEvents ? "warning" : "success"}
            />
            <HealthRow
              label={t("折扣码签发")}
              value={t("{count} 失败", { count: health.failedRewards })}
              tone={health.failedRewards ? "warning" : "success"}
            />
          </div>
        </Panel>
      </div>

      <div className="sp-grid sp-grid-3">
        <Panel title={t("主要购买动机")} description={t("客户自报")}>
          <BarsOrEmpty rows={analytics.motivation} />
        </Panel>
        <Panel title={t("首次认知渠道")} description={t("客户自报")}>
          <BarsOrEmpty rows={analytics.channel} />
        </Panel>
        <Panel title={t("差点未购买的因素")} description={t("客户自报")}>
          <BarsOrEmpty rows={analytics.barrier} />
        </Panel>
      </div>

      <Panel
        title={t("核心产品动机")}
        description={t("按订单或核心产品回答分组")}
      >
        <div className="sp-table-wrap">
          <table className="sp-table">
            <thead>
              <tr>
                <th>{t("产品")}</th>
                <th>{t("相关会话")}</th>
                <th>{t("第一动机")}</th>
                <th>{t("占有效回答")}</th>
              </tr>
            </thead>
            <tbody>
              {analytics.productBreakdowns.map((product) => (
                <tr key={product.product}>
                  <td>
                    <strong>{product.product}</strong>
                  </td>
                  <td>{number(product.total)}</td>
                  <td>{product.rows[0]?.label ?? "—"}</td>
                  <td>{product.rows[0] ? `${product.rows[0].value}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function SetupItem({
  done,
  label,
  detail,
  action,
}: {
  done: boolean;
  label: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="sp-check-item">
      <span
        className={`sp-check-icon ${done ? "is-done" : ""}`}
        aria-hidden="true"
      >
        {done ? "✓" : "!"}
      </span>
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      {action ? <div className="sp-check-action">{action}</div> : null}
    </div>
  );
}

function HealthRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "neutral";
}) {
  return (
    <div className="sp-health-row">
      <span>{label}</span>
      <StatusBadge tone={tone}>{value}</StatusBadge>
    </div>
  );
}
