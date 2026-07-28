import { useMemo, useState, type ReactNode } from "react";
import { RESPONSE_ROWS } from "./shopoll-data";
import { Notice, PageHeader, StatusBadge } from "./ShopollUi";

export function ResponsesPage({ exportAction }: { exportAction?: ReactNode }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [product, setProduct] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = RESPONSE_ROWS.find((row) => row.id === selectedId);
  const visible = useMemo(
    () =>
      RESPONSE_ROWS.filter((row) => {
        const queryMatch = Object.values(row)
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase());
        const statusMatch = status === "all" || row.status === status;
        const productMatch = product === "all" || row.product === product;
        return queryMatch && statusMatch && productMatch;
      }),
    [product, query, status],
  );

  return (
    <div className="sp-page-content">
      <PageHeader
        title="回答"
        description="逐条查看完整与部分回答；联系方式默认从分析和导出中排除。"
        actions={exportAction}
      />
      <div className="sp-summary-strip">
        <div>
          <strong>1,160</strong>
          <span>全部会话</span>
        </div>
        <div>
          <strong>874</strong>
          <span>已完成</span>
        </div>
        <div>
          <strong>286</strong>
          <span>部分回答</span>
        </div>
        <div>
          <strong>00:41</strong>
          <span>平均时长</span>
        </div>
      </div>
      <div className="sp-toolbar">
        <div className="sp-search">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="搜索回答"
            placeholder="搜索回答 ID、订单或来源"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        <select
          aria-label="按回答状态筛选"
          value={status}
          onChange={(event) => setStatus(event.currentTarget.value)}
        >
          <option value="all">所有状态</option>
          <option>已完成</option>
          <option>部分回答</option>
        </select>
        <select
          aria-label="按产品筛选"
          value={product}
          onChange={(event) => setProduct(event.currentTarget.value)}
        >
          <option value="all">所有产品</option>
          <option>Paper7</option>
          <option>Bricbloc</option>
          <option>Nexus</option>
        </select>
        <select aria-label="日期范围">
          <option>最近 7 天</option>
          <option>最近 30 天</option>
          <option>自定义</option>
        </select>
        <button type="button" className="sp-button sp-button-quiet">
          筛选
        </button>
      </div>

      <div className={`sp-response-layout ${selected ? "has-detail" : ""}`}>
        <div className="sp-table-shell">
          <div className="sp-table-wrap">
            <table className="sp-table sp-response-table">
              <thead>
                <tr>
                  <th>回答</th>
                  <th>问卷</th>
                  <th>产品</th>
                  <th>市场 / 语言</th>
                  <th>状态</th>
                  <th>进度</th>
                  <th>订单</th>
                  <th>相关收入</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={row.id}
                    className={selectedId === row.id ? "is-selected" : ""}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td>
                      <button
                        type="button"
                        className="sp-id-button"
                        onClick={() => setSelectedId(row.id)}
                      >
                        {row.id}
                      </button>
                    </td>
                    <td>{row.survey}</td>
                    <td>
                      <strong>{row.product}</strong>
                    </td>
                    <td>
                      {row.market} · {row.locale.toUpperCase()}
                    </td>
                    <td>
                      <StatusBadge
                        tone={row.status === "已完成" ? "success" : "warning"}
                      >
                        {row.status}
                      </StatusBadge>
                    </td>
                    <td>
                      {row.answered}
                      <small>{row.duration}</small>
                    </td>
                    <td>{row.order}</td>
                    <td>{row.revenue}</td>
                    <td className="sp-muted">{row.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="sp-table-footer">
            <span>显示 {visible.length} 份示例回答</span>
            <div>
              <button type="button" disabled>
                上一页
              </button>
              <button type="button">下一页</button>
            </div>
          </footer>
        </div>

        {selected ? (
          <aside
            className="sp-response-detail"
            aria-label={`${selected.id} 回答详情`}
          >
            <header>
              <div>
                <span className="sp-eyebrow">{selected.id}</span>
                <h2>
                  {selected.product} · {selected.status}
                </h2>
              </div>
              <button
                type="button"
                aria-label="关闭详情"
                onClick={() => setSelectedId(null)}
              >
                ×
              </button>
            </header>
            <dl className="sp-detail-meta">
              <div>
                <dt>订单</dt>
                <dd>{selected.order}</dd>
              </div>
              <div>
                <dt>市场</dt>
                <dd>{selected.market}</dd>
              </div>
              <div>
                <dt>语言</dt>
                <dd>{selected.locale.toUpperCase()}</dd>
              </div>
              <div>
                <dt>来源</dt>
                <dd>{selected.source}</dd>
              </div>
              <div>
                <dt>耗时</dt>
                <dd>{selected.duration}</dd>
              </div>
              <div>
                <dt>版本</dt>
                <dd>v3</dd>
              </div>
            </dl>
            <div className="sp-answer-list">
              <Answer
                index="01"
                question="本次购买的主要产品是什么？"
                value={selected.product}
              />
              <Answer
                index="02"
                question={`选择 ${selected.product} 最主要的原因是什么？`}
                value={
                  selected.product === "Paper7"
                    ? "零蓝光与护眼"
                    : selected.product === "Bricbloc"
                      ? "充电、存储、扩展三合一"
                      : "本地 AI 与隐私"
                }
              />
              <Answer
                index="03"
                question="最早在哪里知道 Harbor Innovations？"
                value={selected.source}
              />
              {selected.status === "已完成" ? (
                <>
                  <Answer
                    index="04"
                    question="什么因素最差点让你没有下单？"
                    value={
                      selected.product === "Nexus" ? "价格" : "物流时间或费用"
                    }
                  />
                  <Answer
                    index="05"
                    question="还有其他想告诉我们的吗？"
                    value="—"
                  />
                </>
              ) : (
                <div className="sp-unanswered">后续 2 题未回答</div>
              )}
            </div>
            <Notice tone="info" title="隐私保护">
              此视图不加载姓名、邮箱、电话或地址。联系方式答案需要单独授权解密。
            </Notice>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function Answer({
  index,
  question,
  value,
}: {
  index: string;
  question: string;
  value: string;
}) {
  return (
    <div className="sp-answer">
      <span>{index}</span>
      <div>
        <p>{question}</p>
        <strong>{value}</strong>
      </div>
      <small>已保存</small>
    </div>
  );
}
