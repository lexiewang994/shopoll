import { useEffect, useState } from "react";
import type { SurveyLocale } from "../domain";
import { useAdminI18n } from "./AdminI18n";
import { AnalyticsPage } from "./AnalyticsPage";
import { DashboardPage } from "./DashboardPage";
import { IntegrationsPage } from "./IntegrationsPage";
import { ResponsesPage } from "./ResponsesPage";
import { SettingsPage } from "./SettingsPage";
import { SurveyEditorPage } from "./SurveyEditorPage";
import { SurveyListPage } from "./SurveyListPage";
import { SurveyPreview } from "./SurveyPreview";
import { TemplatePickerPage } from "./TemplatePickerPage";
import { StatusBadge } from "./ShopollUi";

type DemoPage =
  | "overview"
  | "surveys"
  | "new"
  | "editor"
  | "responses"
  | "analytics"
  | "integrations"
  | "settings"
  | "preview";

const nav: readonly {
  id: DemoPage;
  label: string;
  short: string;
  shortEn: string;
}[] = [
  { id: "overview", label: "概览", short: "概", shortEn: "O" },
  { id: "surveys", label: "问卷", short: "问", shortEn: "S" },
  { id: "responses", label: "回答", short: "答", shortEn: "R" },
  { id: "analytics", label: "分析", short: "析", shortEn: "A" },
  { id: "integrations", label: "集成", short: "集", shortEn: "I" },
  { id: "settings", label: "设置", short: "设", shortEn: "S" },
  { id: "preview", label: "客户体验", short: "客", shortEn: "C" },
];

export function ShopollDemo() {
  const { locale, t } = useAdminI18n();
  const [page, setPage] = useState<DemoPage>("overview");
  const [navOpen, setNavOpen] = useState(false);
  const navigate = (next: DemoPage) => {
    setPage(next);
    setNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const update = () => {
      const route = window.location.hash.replace("#", "") as DemoPage;
      if ([...nav.map((item) => item.id), "new", "editor"].includes(route))
        setPage(route);
    };
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  const go = (next: DemoPage) => {
    if (window.location.hash !== `#${next}`) {
      window.history.pushState(null, "", `#${next}`);
    }
    navigate(next);
  };
  return (
    <div className="sp-demo-shell">
      <aside className={`sp-demo-sidebar ${navOpen ? "is-open" : ""}`}>
        <div className="sp-demo-brand">
          <span className="sp-brand-mark">S</span>
          <div>
            <strong>Shopoll</strong>
            <small>Harbor Research</small>
          </div>
        </div>
        <nav aria-label={t("Shopoll 导航")}>
          {nav.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={
                page === item.id ||
                (item.id === "surveys" && ["new", "editor"].includes(page))
                  ? "is-active"
                  : ""
              }
              aria-current={page === item.id ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                go(item.id);
              }}
            >
              <span>{locale === "en" ? item.shortEn : item.short}</span>
              {t(item.label)}
            </a>
          ))}
        </nav>
        <div className="sp-demo-sidebar-foot">
          <StatusBadge tone="success">{t("系统正常")}</StatusBadge>
          <small>API 2026-07 · v1.0</small>
        </div>
      </aside>

      <div className="sp-demo-main">
        <header className="sp-demo-topbar">
          <button
            type="button"
            className="sp-mobile-menu"
            aria-label={t("打开导航")}
            onClick={() => setNavOpen((value) => !value)}
          >
            ☰
          </button>
          <div>
            <strong>Harbor Innovations</strong>
            <span>shop.harborinno.com</span>
          </div>
          <span className="sp-topbar-spacer" />
          <StatusBadge tone="info">{t("演示数据")}</StatusBadge>
          <button
            type="button"
            className="sp-avatar"
            aria-label={t("账户菜单")}
          >
            BW
          </button>
        </header>
        <main className="sp-demo-content">
          {page === "overview" ? (
            <DashboardPage
              createAction={
                <button
                  type="button"
                  className="sp-button"
                  onClick={() => go("new")}
                >
                  + {t("新建问卷")}
                </button>
              }
              settingsAction={
                <button
                  type="button"
                  className="sp-link-button"
                  onClick={() => go("integrations")}
                >
                  {t("前往设置")}
                </button>
              }
            />
          ) : null}
          {page === "surveys" ? (
            <SurveyListPage
              createAction={
                <button
                  type="button"
                  className="sp-button"
                  onClick={() => go("new")}
                >
                  + {t("新建问卷")}
                </button>
              }
              onEdit={() => go("editor")}
            />
          ) : null}
          {page === "new" ? (
            <TemplatePickerPage
              backAction={
                <button
                  type="button"
                  className="sp-button sp-button-quiet"
                  onClick={() => go("surveys")}
                >
                  {t("返回问卷")}
                </button>
              }
              onSelect={() => go("editor")}
            />
          ) : null}
          {page === "editor" ? (
            <SurveyEditorPage
              backAction={
                <button
                  type="button"
                  className="sp-button sp-button-quiet"
                  onClick={() => go("surveys")}
                >
                  {t("返回列表")}
                </button>
              }
            />
          ) : null}
          {page === "responses" ? (
            <ResponsesPage
              exportAction={
                <button
                  type="button"
                  className="sp-button sp-button-secondary"
                  onClick={() => downloadDemoCsv()}
                >
                  ↓ {t("导出 CSV")}
                </button>
              }
            />
          ) : null}
          {page === "analytics" ? (
            <AnalyticsPage
              exportAction={
                <button
                  type="button"
                  className="sp-button sp-button-secondary"
                  onClick={() => downloadDemoCsv()}
                >
                  ↓ {t("导出报表")}
                </button>
              }
            />
          ) : null}
          {page === "integrations" ? <IntegrationsPage /> : null}
          {page === "settings" ? <SettingsPage /> : null}
          {page === "preview" ? <PublicExperience /> : null}
        </main>
      </div>
      {navOpen ? (
        <button
          type="button"
          className="sp-nav-scrim"
          aria-label={t("关闭导航")}
          onClick={() => setNavOpen(false)}
        />
      ) : null}
    </div>
  );
}

function PublicExperience() {
  const [locale, setLocale] = useState<SurveyLocale>("en");
  const [product, setProduct] = useState<"paper7" | "bricbloc" | "nexus">(
    "paper7",
  );
  const [surface, setSurface] = useState("standalone");
  return (
    <div className="sp-customer-demo">
      <header className="sp-customer-demo-toolbar">
        <div>
          <span className="sp-eyebrow">客户体验预览</span>
          <h1>购买动机问卷</h1>
        </div>
        <div className="sp-customer-demo-controls">
          <select
            aria-label="触达面"
            value={surface}
            onChange={(event) => setSurface(event.currentTarget.value)}
          >
            <option value="standalone">独立链接</option>
            <option value="theme">站内弹层</option>
            <option value="checkout">Thank you block</option>
          </select>
          <select
            aria-label="产品"
            value={product}
            onChange={(event) =>
              setProduct(event.currentTarget.value as typeof product)
            }
          >
            <option value="paper7">Paper7</option>
            <option value="bricbloc">Bricbloc</option>
            <option value="nexus">Nexus</option>
          </select>
          <select
            aria-label="语言"
            value={locale}
            onChange={(event) =>
              setLocale(event.currentTarget.value as SurveyLocale)
            }
          >
            <option value="en">English</option>
            <option value="de">Deutsch</option>
            <option value="es">Español</option>
          </select>
        </div>
      </header>
      <div className={`sp-customer-demo-stage is-${surface}`}>
        <SurveyPreview
          key={`${locale}-${product}-${surface}`}
          locale={locale}
          product={product}
        />
      </div>
    </div>
  );
}

function downloadDemoCsv() {
  const csv =
    "response_id,survey,product,status,revenue\nR-1048,purchase-motivation,Paper7,completed,549\nR-1047,purchase-motivation,Nexus,partial,1899\n";
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "shopoll-demo-responses.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
