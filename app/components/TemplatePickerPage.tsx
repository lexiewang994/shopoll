import { useState, type ReactNode } from "react";
import { useAdminI18n } from "./AdminI18n";
import { TEMPLATE_OPTIONS } from "./shopoll-data";
import { Notice, PageHeader, StatusBadge } from "./ShopollUi";

export function TemplatePickerPage({
  backAction,
  onSelect,
}: {
  backAction?: ReactNode;
  onSelect?: (templateId: string) => Promise<void> | void;
}) {
  const { t } = useAdminI18n();
  const [filter, setFilter] = useState("all");
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectTemplate = async (templateId: string) => {
    setCreatingId(templateId);
    setError(null);
    try {
      await onSelect?.(templateId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("无法创建问卷"));
      setCreatingId(null);
    }
  };
  const filters = [
    { value: "all", label: t("全部") },
    { value: "onsite", label: t("站内") },
    { value: "checkout", label: t("订单后") },
    { value: "klaviyo", label: "Klaviyo" },
    { value: "standalone", label: t("独立链接") },
  ];
  const visible = TEMPLATE_OPTIONS.filter(({ definition, channel }) => {
    if (filter === "all") return true;
    if (filter === "onsite")
      return ["purchase_barrier", "cart_exit"].includes(definition.category);
    if (filter === "checkout")
      return definition.category === "purchase_motivation";
    if (filter === "klaviyo") return channel.includes("Klaviyo");
    return (
      definition.category === "standalone" ||
      definition.category === "product_satisfaction"
    );
  });

  return (
    <div className="sp-page-content">
      <PageHeader
        eyebrow={t("新建问卷")}
        title={t("选择起点")}
        description={t("从 Harbor 预置内容开始，所有模板创建后默认为草稿。")}
        actions={backAction}
      />
      {error ? (
        <Notice tone="warning" title={t("创建未完成")}>
          {error}
        </Notice>
      ) : null}
      <div
        className="sp-filter-group sp-template-filters"
        role="group"
        aria-label={t("模板分类")}
      >
        {filters.map((item) => (
          <button
            type="button"
            key={item.value}
            className={filter === item.value ? "is-active" : ""}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="sp-template-grid">
        {visible.map(({ definition, label, channel, description }, index) => (
          <article className="sp-template-card" key={definition.id}>
            <div className="sp-template-topline">
              <span className="sp-template-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              {definition.category === "purchase_motivation" ? (
                <StatusBadge tone="info">{t("推荐首发")}</StatusBadge>
              ) : (
                <StatusBadge>{t(channel)}</StatusBadge>
              )}
            </div>
            <div>
              <h2>{t(label)}</h2>
              <p>{t(description)}</p>
            </div>
            <dl className="sp-template-meta">
              <div>
                <dt>{t("问题")}</dt>
                <dd>
                  {
                    definition.questions.filter(
                      (question) => !["welcome", "end"].includes(question.kind),
                    ).length
                  }
                </dd>
              </div>
              <div>
                <dt>{t("语言")}</dt>
                <dd>EN · DE · ES</dd>
              </div>
              <div>
                <dt>{t("渠道")}</dt>
                <dd>{t(channel)}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="sp-button sp-button-full"
              disabled={creatingId !== null}
              onClick={() => void selectTemplate(definition.id)}
            >
              {creatingId === definition.id ? t("正在创建…") : t("使用此模板")}
            </button>
          </article>
        ))}
        <article className="sp-template-card sp-template-blank">
          <div className="sp-template-topline">
            <span className="sp-template-index">+</span>
            <StatusBadge>{t("空白")}</StatusBadge>
          </div>
          <div>
            <h2>{t("从空白问卷开始")}</h2>
            <p>{t("自行组合题型、逻辑、受众和渠道；适合已有明确研究设计。")}</p>
          </div>
          <dl className="sp-template-meta">
            <div>
              <dt>{t("问题")}</dt>
              <dd>0</dd>
            </div>
            <div>
              <dt>{t("语言")}</dt>
              <dd>EN</dd>
            </div>
            <div>
              <dt>{t("渠道")}</dt>
              <dd>{t("未设置")}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="sp-button sp-button-secondary sp-button-full"
            disabled={creatingId !== null}
            onClick={() => void selectTemplate("blank")}
          >
            {creatingId === "blank" ? t("正在创建…") : t("创建空白问卷")}
          </button>
        </article>
      </div>
    </div>
  );
}
