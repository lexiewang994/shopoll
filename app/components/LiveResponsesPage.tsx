import { useMemo, useState, type ReactNode } from "react";

import { useAdminI18n } from "./AdminI18n";
import type { LiveResponseRow } from "./live-admin-types";
import { Notice, PageHeader, StatusBadge } from "./ShopollUi";

function statusLabel(status: string): string {
  if (status === "COMPLETED") return "已完成";
  if (status === "VIEWED") return "仅浏览";
  return "部分回答";
}

function duration(value: number | null): string {
  if (value === null) return "—";
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function shortId(id: string): string {
  return `R-${id.slice(-8).toUpperCase()}`;
}

export function LiveResponsesPage({
  rows,
  exportAction,
}: {
  rows: LiveResponseRow[];
  exportAction?: ReactNode;
}) {
  const { t, number, date, money } = useAdminI18n();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [product, setProduct] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find((row) => row.id === selectedId);
  const products = [
    ...new Set(rows.map((row) => row.product).filter((value) => value !== "—")),
  ].sort();
  const visible = useMemo(
    () =>
      rows.filter((row) => {
        const haystack = [
          row.id,
          row.survey,
          row.product,
          row.market,
          row.locale,
          row.source,
          ...row.answers.flatMap((answer) => [answer.question, answer.value]),
        ]
          .join(" ")
          .toLowerCase();
        const statusMatch =
          status === "all" ||
          (status === "COMPLETED"
            ? row.status === "COMPLETED"
            : row.status !== "COMPLETED");
        return (
          haystack.includes(query.toLowerCase()) &&
          statusMatch &&
          (product === "all" || row.product === product)
        );
      }),
    [product, query, rows, status],
  );
  const completions = rows.filter((row) => row.status === "COMPLETED").length;
  const partials = rows.filter(
    (row) => row.status !== "COMPLETED" && row.answered > 0,
  ).length;
  const durations = rows.flatMap((row) =>
    row.durationSeconds === null ? [] : [row.durationSeconds],
  );
  const average = durations.length
    ? Math.round(
        durations.reduce((sum, value) => sum + value, 0) / durations.length,
      )
    : null;

  return (
    <div className="sp-page-content">
      <PageHeader
        title={t("回答")}
        description={t(
          "逐条查看完整与部分回答；联系方式从此视图和默认 CSV 中排除。",
        )}
        actions={exportAction}
      />
      <div className="sp-summary-strip">
        <div>
          <strong>{number(rows.length)}</strong>
          <span>{t("当前结果")}</span>
        </div>
        <div>
          <strong>{number(completions)}</strong>
          <span>{t("已完成")}</span>
        </div>
        <div>
          <strong>{number(partials)}</strong>
          <span>{t("部分回答")}</span>
        </div>
        <div>
          <strong>{duration(average)}</strong>
          <span>{t("平均时长")}</span>
        </div>
      </div>
      <div className="sp-toolbar">
        <div className="sp-search">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label={t("搜索回答")}
            placeholder={t("搜索回答、问卷或答案")}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        <select
          aria-label={t("按回答状态筛选")}
          value={status}
          onChange={(event) => setStatus(event.currentTarget.value)}
        >
          <option value="all">{t("所有状态")}</option>
          <option value="COMPLETED">{t("已完成")}</option>
          <option value="PARTIAL">{t("部分回答")}</option>
        </select>
        <select
          aria-label={t("按产品筛选")}
          value={product}
          onChange={(event) => setProduct(event.currentTarget.value)}
        >
          <option value="all">{t("所有产品")}</option>
          {products.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>

      <div className={`sp-response-layout ${selected ? "has-detail" : ""}`}>
        <div className="sp-table-shell">
          <div className="sp-table-wrap">
            <table className="sp-table sp-response-table">
              <thead>
                <tr>
                  <th>{t("回答")}</th>
                  <th>{t("问卷")}</th>
                  <th>{t("产品")}</th>
                  <th>{t("市场 / 语言")}</th>
                  <th>{t("状态")}</th>
                  <th>{t("进度")}</th>
                  <th>{t("订单")}</th>
                  <th>{t("相关收入")}</th>
                  <th>{t("时间")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.length ? (
                  visible.map((row) => (
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
                          {shortId(row.id)}
                        </button>
                      </td>
                      <td>
                        {row.survey}
                        <small>
                          v{row.version} · {row.surface.toLowerCase()}
                        </small>
                      </td>
                      <td>
                        <strong>{row.product}</strong>
                      </td>
                      <td>
                        {row.market} · {row.locale.toUpperCase()}
                      </td>
                      <td>
                        <StatusBadge
                          tone={
                            row.status === "COMPLETED" ? "success" : "warning"
                          }
                        >
                          {t(statusLabel(row.status))}
                        </StatusBadge>
                      </td>
                      <td>
                        {row.answered}/{row.totalQuestions}
                        <small>{duration(row.durationSeconds)}</small>
                      </td>
                      <td>{row.hasOrder ? t("已关联") : "—"}</td>
                      <td>
                        {row.revenue === null
                          ? "—"
                          : money(row.revenue, row.currency)}
                      </td>
                      <td className="sp-muted">
                        {date(row.createdAt, {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="sp-muted">
                      {t("当前筛选没有回答。")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <footer className="sp-table-footer">
            <span>
              {t("显示 {visible} / {total} 份回答（最多加载最近 200 份）", {
                visible: number(visible.length),
                total: number(rows.length),
              })}
            </span>
          </footer>
        </div>

        {selected ? (
          <aside
            className="sp-response-detail"
            aria-label={`${shortId(selected.id)} ${t("回答详情")}`}
          >
            <header>
              <div>
                <span className="sp-eyebrow">{shortId(selected.id)}</span>
                <h2>
                  {selected.product} · {t(statusLabel(selected.status))}
                </h2>
              </div>
              <button
                type="button"
                aria-label={t("关闭详情")}
                onClick={() => setSelectedId(null)}
              >
                ×
              </button>
            </header>
            <dl className="sp-detail-meta">
              <div>
                <dt>{t("订单")}</dt>
                <dd>{selected.hasOrder ? t("已关联（标识已隐藏）") : "—"}</dd>
              </div>
              <div>
                <dt>{t("市场")}</dt>
                <dd>{selected.market}</dd>
              </div>
              <div>
                <dt>{t("语言")}</dt>
                <dd>{selected.locale.toUpperCase()}</dd>
              </div>
              <div>
                <dt>{t("来源")}</dt>
                <dd>{selected.source}</dd>
              </div>
              <div>
                <dt>{t("耗时")}</dt>
                <dd>{duration(selected.durationSeconds)}</dd>
              </div>
              <div>
                <dt>{t("版本")}</dt>
                <dd>v{selected.version}</dd>
              </div>
            </dl>
            <div className="sp-answer-list">
              {selected.answers.length ? (
                selected.answers.map((answer, index) => (
                  <div
                    className="sp-answer"
                    key={`${answer.question}-${index}`}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <p>{answer.question}</p>
                      <strong>{answer.value}</strong>
                    </div>
                    <small>{t("已保存")}</small>
                  </div>
                ))
              ) : (
                <div className="sp-unanswered">{t("尚未回答任何题目")}</div>
              )}
            </div>
            <Notice tone="info" title={t("隐私保护")}>
              {t("此视图不加载姓名、邮箱、电话或地址，也不返回联系方式密文。")}
            </Notice>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
