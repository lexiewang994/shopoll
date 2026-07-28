import { useState, type ReactNode } from "react";
import {
  BARRIER_DATA,
  CHANNEL_DATA,
  FUNNEL_DATA,
  MOTIVATION_DATA,
  TIME_SERIES,
} from "./shopoll-data";
import {
  HorizontalBars,
  MetricCard,
  Notice,
  PageHeader,
  Panel,
  Segmented,
  SparkBars,
  StatusBadge,
} from "./ShopollUi";

type Breakdown = "motivation" | "channel" | "barrier";

export function AnalyticsPage({ exportAction }: { exportAction?: ReactNode }) {
  const [breakdown, setBreakdown] = useState<Breakdown>("motivation");
  const [product, setProduct] = useState("all");
  const breakdownRows =
    breakdown === "motivation"
      ? MOTIVATION_DATA
      : breakdown === "channel"
        ? CHANNEL_DATA
        : BARRIER_DATA;
  return (
    <div className="sp-page-content">
      <PageHeader
        title="分析"
        description="连接调研回答与去标识化订单事实，定位动机、渠道和阻碍。"
        actions={exportAction}
      />
      <div className="sp-analytics-filters">
        <select aria-label="问卷">
          <option>所有问卷</option>
          <option>购买动机 · 核心产品</option>
          <option>交付后 NPS</option>
        </select>
        <select
          aria-label="产品"
          value={product}
          onChange={(event) => setProduct(event.currentTarget.value)}
        >
          <option value="all">所有产品</option>
          <option value="paper7">Paper7</option>
          <option value="bricbloc">Bricbloc</option>
          <option value="nexus">Nexus</option>
        </select>
        <select aria-label="市场">
          <option>所有市场</option>
          <option>United States</option>
          <option>Germany</option>
          <option>Spain</option>
        </select>
        <select aria-label="语言">
          <option>所有语言</option>
          <option>English</option>
          <option>Deutsch</option>
          <option>Español</option>
        </select>
        <select aria-label="来源">
          <option>所有来源</option>
          <option>YouTube</option>
          <option>Google</option>
          <option>Reddit</option>
        </select>
        <select aria-label="UTM">
          <option>所有 UTM</option>
          <option>summer_launch</option>
          <option>creator_review</option>
        </select>
        <select aria-label="日期">
          <option>最近 30 天</option>
          <option>最近 7 天</option>
          <option>本季度</option>
        </select>
        <button type="button" className="sp-link-button">
          重置
        </button>
      </div>
      <div className="sp-active-filter-row">
        <StatusBadge tone="info">
          {product === "all"
            ? "全部产品"
            : product === "paper7"
              ? "Paper7"
              : product === "bricbloc"
                ? "Bricbloc"
                : "Nexus"}
        </StatusBadge>
        <span>2026-06-27 至 2026-07-26 · 对比上一周期</span>
      </div>

      <div className="sp-metrics-grid sp-metrics-5">
        <MetricCard label="曝光" value="18,462" delta="+9.8%" tone="positive" />
        <MetricCard label="开始" value="3,942" delta="+11.2%" tone="positive" />
        <MetricCard
          label="部分回答"
          value="824"
          delta="-3.4%"
          tone="positive"
        />
        <MetricCard
          label="完成率"
          value="70.0%"
          delta="+1.6 pp"
          tone="positive"
        />
        <MetricCard label="NPS" value="+52" delta="+6" tone="positive" />
      </div>

      <div className="sp-grid sp-grid-2-1">
        <Panel title="完成趋势" description="最近 14 天 · 完整回答">
          <div className="sp-trend-summary">
            <div>
              <strong>2,759</strong>
              <span>完整回答</span>
            </div>
            <div>
              <strong>+12.8%</strong>
              <span>环比变化</span>
            </div>
            <div>
              <strong>92</strong>
              <span>单日峰值</span>
            </div>
          </div>
          <SparkBars
            values={TIME_SERIES.map((value) =>
              product === "all" ? value : Math.round(value * 0.46),
            )}
          />
          <div className="sp-axis">
            <span>7月13日</span>
            <span>7月26日</span>
          </div>
        </Panel>
        <Panel title="完成漏斗" description="相对上一步">
          <div className="sp-funnel">
            {FUNNEL_DATA.map((row, index) => (
              <div key={row.label}>
                <span>{row.label}</span>
                <div>
                  <span style={{ width: `${row.rate}%` }} />
                </div>
                <strong>{row.value.toLocaleString()}</strong>
                {index ? <small>{row.rate}%</small> : <small>100%</small>}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="sp-grid sp-grid-2">
        <Panel
          title="客户自报洞察"
          description="选择项占该问题有效回答的比例"
          action={
            <Segmented
              value={breakdown}
              onChange={setBreakdown}
              label="分析维度"
              options={[
                { value: "motivation", label: "动机" },
                { value: "channel", label: "渠道" },
                { value: "barrier", label: "阻碍" },
              ]}
            />
          }
        >
          <HorizontalBars rows={breakdownRows} />
        </Panel>
        <Panel title="按产品对比" description="前三购买动机">
          <div className="sp-product-breakdown">
            <ProductBreakdown
              product="Paper7"
              total="198"
              rows={[
                { label: "零蓝光 / 护眼", value: 42 },
                { label: "彩色 60Hz RLCD", value: 24 },
                { label: "户外可读", value: 14 },
              ]}
            />
            <ProductBreakdown
              product="Bricbloc"
              total="142"
              rows={[
                { label: "三合一", value: 36 },
                { label: "差旅便携", value: 22 },
                { label: "GaN 快充", value: 18 },
              ]}
            />
            <ProductBreakdown
              product="Nexus"
              total="88"
              rows={[
                { label: "本地 AI 与隐私", value: 34 },
                { label: "全尺寸 GPU", value: 21 },
                { label: "开放可升级", value: 17 },
              ]}
            />
          </div>
        </Panel>
      </div>

      <div className="sp-grid sp-grid-2">
        <Panel title="NPS 分布" description="162 份有效回答">
          <div className="sp-nps-head">
            <div>
              <strong>+52</strong>
              <span>NPS</span>
            </div>
            <div>
              <span className="sp-dot sp-dot-green" />
              推广者 64%
            </div>
            <div>
              <span className="sp-dot sp-dot-gray" />
              中立者 24%
            </div>
            <div>
              <span className="sp-dot sp-dot-red" />
              贬损者 12%
            </div>
          </div>
          <div className="sp-histogram" aria-label="NPS 0 到 10 分布">
            {[3, 4, 5, 5, 8, 10, 12, 18, 22, 52, 61].map((value, index) => (
              <div key={index}>
                <span
                  style={{ height: `${(value / 61) * 100}%` }}
                  className={
                    index <= 6
                      ? "is-negative"
                      : index <= 8
                        ? "is-neutral"
                        : "is-positive"
                  }
                />
                <small>{index}</small>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="订单与收入" description="回答与订单事实的相关关系">
          <Notice tone="warning" title="相关性，不代表因果">
            本视图用于比较客户分组，不能证明问卷回答或触达导致了购买。
          </Notice>
          <div className="sp-correlation-metrics">
            <div>
              <span>相关订单</span>
              <strong>428</strong>
            </div>
            <div>
              <span>相关收入</span>
              <strong>$182,420</strong>
            </div>
            <div>
              <span>相关 AOV</span>
              <strong>$426.21</strong>
            </div>
          </div>
          <div className="sp-correlation-row">
            <span>护眼动机</span>
            <div>
              <span style={{ width: "76%" }} />
            </div>
            <strong>$584 AOV</strong>
          </div>
          <div className="sp-correlation-row">
            <span>价格动机</span>
            <div>
              <span style={{ width: "43%" }} />
            </div>
            <strong>$329 AOV</strong>
          </div>
          <div className="sp-correlation-row">
            <span>评价推荐</span>
            <div>
              <span style={{ width: "58%" }} />
            </div>
            <strong>$446 AOV</strong>
          </div>
        </Panel>
      </div>

      <Panel title="逐题流失" description="按发布版本冻结的题目快照计算">
        <div className="sp-table-wrap">
          <table className="sp-table">
            <thead>
              <tr>
                <th>题目</th>
                <th>看见</th>
                <th>回答</th>
                <th>跳过</th>
                <th>流失</th>
                <th>中位耗时</th>
              </tr>
            </thead>
            <tbody>
              <DropoffRow
                question="本次购买的主要产品是什么？"
                seen="1,094"
                answered="1,081"
                skipped="0"
                dropout="1.2%"
                time="5 秒"
              />
              <DropoffRow
                question="选择该产品的最主要原因"
                seen="1,081"
                answered="1,026"
                skipped="0"
                dropout="5.1%"
                time="9 秒"
              />
              <DropoffRow
                question="最早在哪里知道 Harbor Innovations？"
                seen="1,026"
                answered="986"
                skipped="0"
                dropout="3.9%"
                time="7 秒"
              />
              <DropoffRow
                question="什么因素最差点让你没有下单？"
                seen="986"
                answered="874"
                skipped="0"
                dropout="11.4%"
                time="12 秒"
              />
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function ProductBreakdown({
  product,
  total,
  rows,
}: {
  product: string;
  total: string;
  rows: { label: string; value: number }[];
}) {
  return (
    <section>
      <header>
        <strong>{product}</strong>
        <span>{total} 份</span>
      </header>
      {rows.map((row) => (
        <div key={row.label}>
          <span>{row.label}</span>
          <div>
            <span style={{ width: `${row.value}%` }} />
          </div>
          <strong>{row.value}%</strong>
        </div>
      ))}
    </section>
  );
}
function DropoffRow({
  question,
  seen,
  answered,
  skipped,
  dropout,
  time,
}: Record<string, string>) {
  return (
    <tr>
      <td>
        <strong>{question}</strong>
      </td>
      <td>{seen}</td>
      <td>{answered}</td>
      <td>{skipped}</td>
      <td>{dropout}</td>
      <td>{time}</td>
    </tr>
  );
}
