import { useMemo, useState, type ReactNode } from "react";
import { useAdminI18n } from "./AdminI18n";
import { SURVEY_ROWS, type SurveyRow, type SurveyState } from "./shopoll-data";
import {
  EmptyState,
  Notice,
  PageHeader,
  ProgressBar,
  StatusBadge,
} from "./ShopollUi";

const statusCopy: Record<
  SurveyState,
  { label: string; tone: "success" | "warning" | "neutral" }
> = {
  active: { label: "运行中", tone: "success" },
  draft: { label: "草稿", tone: "neutral" },
  paused: { label: "已暂停", tone: "warning" },
};

export function SurveyListPage({
  createAction,
  onEdit,
  initialRows,
  onDuplicate,
  onToggleStatus,
}: {
  createAction?: ReactNode;
  onEdit?: (id: string) => void;
  initialRows?: SurveyRow[];
  onDuplicate?: (row: SurveyRow) => Promise<SurveyRow>;
  onToggleStatus?: (row: SurveyRow) => Promise<SurveyRow>;
}) {
  const { t, number, date } = useAdminI18n();
  const [rows, setRows] = useState(initialRows ?? SURVEY_ROWS);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | SurveyState>("all");
  const [channel, setChannel] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        const matchesQuery = `${row.name} ${row.category} ${row.channel}`
          .toLowerCase()
          .includes(query.toLowerCase());
        const matchesStatus = status === "all" || row.status === status;
        const matchesChannel =
          channel === "all" || row.channel.includes(channel);
        return matchesQuery && matchesStatus && matchesChannel;
      }),
    [channel, query, rows, status],
  );

  const toggleSelected = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  const toggleStatus = async (row: SurveyRow) => {
    if (row.status === "draft") {
      onEdit?.(row.id);
      return;
    }
    setPendingId(row.id);
    setError(null);
    try {
      const updated: SurveyRow = onToggleStatus
        ? await onToggleStatus(row)
        : {
            ...row,
            status: row.status === "active" ? "paused" : "active",
          };
      setRows((current) =>
        current.map((item) => (item.id === row.id ? updated : item)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("无法更新问卷状态"));
    } finally {
      setPendingId(null);
    }
  };
  const duplicate = async (row: SurveyRow) => {
    setPendingId(row.id);
    setError(null);
    try {
      const copied = onDuplicate
        ? await onDuplicate(row)
        : {
            ...row,
            id: `${row.id}-copy-${rows.length}`,
            name: t("{name}（副本）", { name: row.name }),
            status: "draft" as const,
            responses: 0,
            completionRate: 0,
            updatedAt: new Date().toISOString(),
          };
      setRows((current) => [copied, ...current]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("无法复制问卷"));
    } finally {
      setPendingId(null);
    }
  };

  const averageCompletionRate = rows.length
    ? rows.reduce((sum, row) => sum + row.completionRate, 0) / rows.length
    : 0;

  return (
    <div className="sp-page-content">
      <PageHeader
        title={t("问卷")}
        description={t("创建、定向、发布并管理所有客户调研。")}
        actions={createAction}
      />

      {error ? (
        <Notice tone="warning" title={t("操作未完成")}>
          {error}
        </Notice>
      ) : null}

      <div className="sp-summary-strip">
        <div>
          <strong>
            {rows.filter((row) => row.status === "active").length}
          </strong>
          <span>{t("运行中")}</span>
        </div>
        <div>
          <strong>{rows.filter((row) => row.status === "draft").length}</strong>
          <span>{t("草稿")}</span>
        </div>
        <div>
          <strong>
            {number(rows.reduce((sum, row) => sum + row.responses, 0))}
          </strong>
          <span>{t("总回答")}</span>
        </div>
        <div>
          <strong>{averageCompletionRate.toFixed(1)}%</strong>
          <span>{t("平均完成率")}</span>
        </div>
      </div>

      <div className="sp-toolbar">
        <div className="sp-search">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label={t("搜索问卷")}
            placeholder={t("搜索问卷")}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        <select
          aria-label={t("按状态筛选")}
          value={status}
          onChange={(event) =>
            setStatus(event.currentTarget.value as "all" | SurveyState)
          }
        >
          <option value="all">{t("所有状态")}</option>
          <option value="active">{t("运行中")}</option>
          <option value="draft">{t("草稿")}</option>
          <option value="paused">{t("已暂停")}</option>
        </select>
        <select
          aria-label={t("按渠道筛选")}
          value={channel}
          onChange={(event) => setChannel(event.currentTarget.value)}
        >
          <option value="all">{t("所有渠道")}</option>
          <option value="Thank you">Thank you</option>
          <option value="商品页">{t("商品页")}</option>
          <option value="购物车">{t("购物车")}</option>
          <option value="Klaviyo">Klaviyo</option>
          <option value="独立链接">{t("独立链接")}</option>
        </select>
        <button type="button" className="sp-button sp-button-quiet">
          {t("更多筛选")}
        </button>
        <span className="sp-toolbar-spacer" />
        {selected.length ? (
          <span className="sp-selection-count">
            {t("已选 {count} 项", { count: selected.length })}
          </span>
        ) : null}
      </div>

      {visible.length ? (
        <div className="sp-table-shell">
          <div className="sp-table-wrap">
            <table className="sp-table sp-survey-table">
              <thead>
                <tr>
                  <th className="sp-check-cell">
                    <input
                      type="checkbox"
                      aria-label={t("选择全部可见问卷")}
                      checked={
                        visible.length > 0 &&
                        visible.every((row) => selected.includes(row.id))
                      }
                      onChange={(event) =>
                        setSelected(
                          event.currentTarget.checked
                            ? visible.map((row) => row.id)
                            : [],
                        )
                      }
                    />
                  </th>
                  <th>{t("问卷")}</th>
                  <th>{t("状态")}</th>
                  <th>{t("触达渠道")}</th>
                  <th>{t("回答")}</th>
                  <th>{t("完成率")}</th>
                  <th>{t("优先级")}</th>
                  <th>{t("最近更新")}</th>
                  <th>
                    <span className="sp-visually-hidden">{t("操作")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const copy = statusCopy[row.status];
                  return (
                    <tr key={row.id}>
                      <td className="sp-check-cell">
                        <input
                          type="checkbox"
                          aria-label={t("选择 {name}", { name: row.name })}
                          checked={selected.includes(row.id)}
                          onChange={() => toggleSelected(row.id)}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="sp-name-button"
                          onClick={() => onEdit?.(row.id)}
                        >
                          <strong>{row.name}</strong>
                          <span>{t(row.category)}</span>
                        </button>
                      </td>
                      <td>
                        <StatusBadge tone={copy.tone}>
                          {t(copy.label)}
                        </StatusBadge>
                      </td>
                      <td>
                        {row.channel
                          .split(" · ")
                          .map((item) => t(item))
                          .join(" · ")}
                      </td>
                      <td>{number(row.responses)}</td>
                      <td>
                        <div className="sp-rate-cell">
                          <span>
                            {row.completionRate
                              ? `${row.completionRate}%`
                              : "—"}
                          </span>
                          <ProgressBar value={row.completionRate} />
                        </div>
                      </td>
                      <td>{row.priority}</td>
                      <td className="sp-muted">
                        {date(row.updatedAt, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td>
                        <details className="sp-menu">
                          <summary
                            aria-label={t("{name} 操作", { name: row.name })}
                          >
                            •••
                          </summary>
                          <div className="sp-menu-popover">
                            <button
                              type="button"
                              onClick={() => onEdit?.(row.id)}
                            >
                              {t("编辑")}
                            </button>
                            <button
                              type="button"
                              disabled={pendingId === row.id}
                              onClick={() => void duplicate(row)}
                            >
                              {pendingId === row.id ? t("处理中…") : t("复制")}
                            </button>
                            <button
                              type="button"
                              disabled={pendingId === row.id}
                              onClick={() => void toggleStatus(row)}
                            >
                              {row.status === "active"
                                ? t("暂停")
                                : row.status === "paused"
                                  ? t("启用")
                                  : t("编辑并发布")}
                            </button>
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <footer className="sp-table-footer">
            <span>
              {t("显示 {visible} / {total} 个问卷", {
                visible: number(visible.length),
                total: number(rows.length),
              })}
            </span>
            <div>
              <button type="button" disabled>
                {t("上一页")}
              </button>
              <button type="button" disabled>
                {t("下一页")}
              </button>
            </div>
          </footer>
        </div>
      ) : (
        <EmptyState
          title={t("没有匹配的问卷")}
          detail={t("调整搜索词或筛选条件后重试。")}
          action={
            <button
              type="button"
              className="sp-button"
              onClick={() => {
                setQuery("");
                setStatus("all");
                setChannel("all");
              }}
            >
              {t("清除筛选")}
            </button>
          }
        />
      )}
    </div>
  );
}
