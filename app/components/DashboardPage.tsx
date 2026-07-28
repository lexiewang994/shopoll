import { useState, type ReactNode } from "react";
import {
  BARRIER_DATA,
  CHANNEL_DATA,
  MOTIVATION_DATA,
  TIME_SERIES,
} from "./shopoll-data";
import {
  HorizontalBars,
  MetricCard,
  Notice,
  PageHeader,
  Panel,
  SparkBars,
  StatusBadge,
} from "./ShopollUi";

export function DashboardPage({
  createAction,
  settingsAction,
}: {
  createAction?: ReactNode;
  settingsAction?: ReactNode;
}) {
  const [range, setRange] = useState("7d");
  const [setupOpen, setSetupOpen] = useState(true);

  return (
    <div className="sp-page-content">
      <PageHeader
        eyebrow="shop.harborinno.com"
        title="概览"
        description="理解客户为何选择 Paper7、Bricbloc 与 Nexus。"
        actions={createAction}
      />

      <Notice tone="info" title="生产环境尚未开始全量展示">
        当前购买动机问卷处于 10%
        流量观察阶段；奖励关闭，数据仅用于产品与营销分析。
      </Notice>

      {setupOpen ? (
        <Panel
          title="上线准备"
          description="4 项关键检查中已完成 3 项"
          action={
            <button
              type="button"
              className="sp-link-button"
              onClick={() => setSetupOpen(false)}
            >
              收起
            </button>
          }
          className="sp-setup"
        >
          <div className="sp-check-grid">
            <SetupItem
              done
              label="Shopify App 已安装"
              detail="shop.harborinno.com · API 2026-07"
            />
            <SetupItem
              done
              label="主题扩展已启用"
              detail="启动代码 8.6 KB gzip"
            />
            <SetupItem
              done
              label="Klaviyo 已连接"
              detail="测试事件最近成功于 10:18"
            />
            <SetupItem
              label="Checkout block 待确认"
              detail="在结账编辑器添加 Thank you block"
              action={settingsAction}
            />
          </div>
        </Panel>
      ) : null}

      <div className="sp-toolbar sp-toolbar-compact">
        <div className="sp-filter-group" role="group" aria-label="日期范围">
          {[
            { value: "7d", label: "最近 7 天" },
            { value: "30d", label: "30 天" },
            { value: "90d", label: "90 天" },
          ].map((option) => (
            <button
              type="button"
              key={option.value}
              className={range === option.value ? "is-active" : ""}
              onClick={() => setRange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="sp-muted">更新于 1 分钟前</span>
      </div>

      <div className="sp-metrics-grid">
        <MetricCard
          label="问卷曝光"
          value={range === "7d" ? "5,840" : "19,462"}
          delta="+12.4%"
          tone="positive"
          detail="较上一周期"
        />
        <MetricCard
          label="开始率"
          value="21.4%"
          delta="+2.1 pp"
          tone="positive"
          detail="1,248 次开始"
        />
        <MetricCard
          label="完成率"
          value="70.0%"
          delta="-1.8 pp"
          tone="negative"
          detail="874 份完整回答"
        />
        <MetricCard
          label="平均完成时长"
          value="00:41"
          delta="-4 秒"
          tone="positive"
          detail="中位数 00:36"
        />
        <MetricCard
          label="NPS"
          value="+52"
          delta="+6"
          tone="positive"
          detail="162 份有效评分"
        />
        <MetricCard
          label="相关订单收入"
          value="$182.4k"
          delta="+8.7%"
          tone="positive"
          detail="仅相关性，不代表因果"
        />
      </div>

      <div className="sp-grid sp-grid-2-1">
        <Panel title="回答趋势" description="完整与部分回答，按天">
          <div className="sp-trend-summary">
            <div>
              <strong>874</strong>
              <span>完整回答</span>
            </div>
            <div>
              <strong>286</strong>
              <span>部分回答</span>
            </div>
            <div>
              <strong>42</strong>
              <span>今日完成</span>
            </div>
          </div>
          <SparkBars values={TIME_SERIES} />
          <div className="sp-axis">
            <span>7月13日</span>
            <span>7月26日</span>
          </div>
        </Panel>

        <Panel title="系统健康" description="过去 24 小时">
          <div className="sp-health-list">
            <HealthRow label="问卷解析 API" value="99.98%" tone="success" />
            <HealthRow label="回答写入" value="0 失败" tone="success" />
            <HealthRow label="Klaviyo 事件" value="2 次重试" tone="warning" />
            <HealthRow label="折扣码签发" value="未启用" tone="neutral" />
          </div>
          <div className="sp-health-foot">最后一次订单同步：今天 10:23</div>
        </Panel>
      </div>

      <div className="sp-grid sp-grid-3">
        <Panel title="主要购买动机" description="跨产品汇总">
          <HorizontalBars rows={MOTIVATION_DATA.slice(0, 4)} />
        </Panel>
        <Panel title="首次认知渠道" description="客户自报">
          <HorizontalBars rows={CHANNEL_DATA.slice(0, 4)} />
        </Panel>
        <Panel title="差点未购买的因素" description="已成交订单">
          <HorizontalBars rows={BARRIER_DATA.slice(0, 4)} />
        </Panel>
      </div>

      <Panel
        title="核心产品概览"
        description="购买动机问卷已完成回答"
        action={
          <button type="button" className="sp-link-button">
            查看完整分析
          </button>
        }
      >
        <div className="sp-table-wrap">
          <table className="sp-table">
            <thead>
              <tr>
                <th>产品</th>
                <th>回答</th>
                <th>完成率</th>
                <th>第一动机</th>
                <th>第一渠道</th>
                <th>相关 AOV</th>
                <th>趋势</th>
              </tr>
            </thead>
            <tbody>
              <ProductRow
                product="Paper7"
                responses="198"
                completion="76.4%"
                motivation="零蓝光 / 护眼"
                channel="YouTube"
                aov="$584"
                trend="+9.2%"
              />
              <ProductRow
                product="Bricbloc"
                responses="142"
                completion="71.8%"
                motivation="三合一"
                channel="搜索引擎"
                aov="$212"
                trend="+4.1%"
              />
              <ProductRow
                product="Nexus"
                responses="88"
                completion="72.1%"
                motivation="本地 AI 与隐私"
                channel="Reddit"
                aov="$1,926"
                trend="+14.6%"
              />
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function SetupItem({
  done = false,
  label,
  detail,
  action,
}: {
  done?: boolean;
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
        {done ? "✓" : "4"}
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

function ProductRow({
  product,
  responses,
  completion,
  motivation,
  channel,
  aov,
  trend,
}: Record<string, string>) {
  return (
    <tr>
      <td>
        <strong>{product}</strong>
      </td>
      <td>{responses}</td>
      <td>{completion}</td>
      <td>{motivation}</td>
      <td>{channel}</td>
      <td>{aov}</td>
      <td>
        <span className="sp-positive">{trend}</span>
      </td>
    </tr>
  );
}
