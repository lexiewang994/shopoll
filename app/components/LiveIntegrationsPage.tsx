import { useState } from "react";

import { useAdminI18n } from "./AdminI18n";
import type { LiveIntegrationsView } from "./live-admin-types";
import { Field, Notice, PageHeader, Panel, StatusBadge } from "./ShopollUi";

const surfaceLabels: Record<string, string> = {
  THANK_YOU: "Thank you block",
  ORDER_STATUS: "Order status block",
  THEME_INLINE: "Theme inline block",
  THEME_POPUP: "Theme app embed / 弹层",
  STANDALONE: "独立链接",
  KLAVIYO_EMAIL: "Klaviyo Email",
  KLAVIYO_SMS: "Klaviyo SMS",
};

const eventLabels: Record<string, string> = {
  "Survey Ready": "Survey Ready",
  "Survey Started": "Survey Started",
  "Survey Completed": "Survey Completed",
  "Reward Issued": "Reward Issued",
  "Shopoll Weekly Report": "Shopoll Weekly Report",
};

function statusCopy(status: string): {
  label: string;
  tone: "success" | "warning" | "critical" | "info" | "neutral";
} {
  if (status === "SENT") return { label: "成功", tone: "success" };
  if (status === "FAILED") return { label: "失败", tone: "critical" };
  if (status === "PROCESSING") return { label: "处理中", tone: "info" };
  if (status === "PENDING") return { label: "待发送", tone: "warning" };
  if (status === "DISCARDED") return { label: "已丢弃", tone: "neutral" };
  return { label: status, tone: "neutral" };
}

async function sendTestEvent(
  email: string,
  requestFailed: string,
): Promise<void> {
  const response = await fetch("/app/api/integrations/klaviyo/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? `${requestFailed} (${response.status})`);
  }
}

export function LiveIntegrationsPage({ data }: { data: LiveIntegrationsView }) {
  const { t, number, date } = useAdminI18n();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const ready = data.klaviyoConfigured && data.flowConfigured;

  const runTest = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t("请输入有效的 Klaviyo 测试 Profile 邮箱。"));
      return;
    }
    setState("sending");
    setError("");
    try {
      await sendTestEvent(email.trim(), t("请求失败"));
      setState("sent");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("测试事件发送失败"),
      );
      setState("idle");
    }
  };

  return (
    <div className="sp-page-content">
      <PageHeader
        title={t("集成")}
        description={t(
          "查看 Shopify 触达、Klaviyo Flow 与事件投递的实时状态。",
        )}
      />

      {state === "sent" ? (
        <Notice tone="success" title={t("测试事件已发送")}>
          {t("Klaviyo 已接受发送给 {email} 的 Survey Ready 事件。", {
            email: email.trim(),
          })}
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="critical" title={t("操作失败")}>
          {error}
        </Notice>
      ) : null}
      {!ready ? (
        <Notice tone="warning" title={t("Klaviyo 配置尚未完整")}>
          {t(
            "私钥与 Flow webhook 配置由 Railway 环境变量管理；补齐后重新部署即可生效。",
          )}
        </Notice>
      ) : null}

      <div className="sp-settings-layout">
        <div className="sp-settings-main">
          <Panel
            title="Klaviyo"
            description={t("Flow 管理同意、退订、延时与邮件 / SMS 模板。")}
            action={
              <StatusBadge tone={ready ? "success" : "warning"}>
                {ready ? t("已连接") : t("配置不完整")}
              </StatusBadge>
            }
          >
            <div className="sp-integration-hero">
              <div className="sp-integration-logo" aria-hidden="true">
                K
              </div>
              <div>
                <strong>Harbor Innovations Klaviyo</strong>
                <span>
                  {t("{count} 个允许的 Flow · 每周报告{status}", {
                    count: number(data.allowedFlowCount),
                    status: data.weeklyReportsEnabled
                      ? t("已启用")
                      : t("未启用"),
                  })}
                </span>
              </div>
              <StatusBadge
                tone={data.klaviyoConfigured ? "success" : "warning"}
              >
                API {data.klaviyoConfigured ? t("就绪") : t("缺失")}
              </StatusBadge>
            </div>

            <div className="sp-form-stack sp-top-gap">
              <div className="sp-readonly-list">
                <ConfigRow
                  label="Private API key"
                  ready={data.klaviyoConfigured}
                />
                <ConfigRow
                  label={t("Flow Bearer 与 allowlist")}
                  ready={data.flowConfigured}
                />
                <ConfigRow
                  label={t("每周报告订阅")}
                  ready={data.weeklyReportsEnabled}
                />
              </div>
              <Field label={t("测试 Profile 邮箱")}>
                <input
                  type="email"
                  value={email}
                  placeholder="growth@harborinno.com"
                  onChange={(event) => {
                    setEmail(event.currentTarget.value);
                    setState("idle");
                  }}
                />
              </Field>
              <button
                type="button"
                className="sp-button sp-fit"
                disabled={!data.klaviyoConfigured || state === "sending"}
                onClick={() => void runTest()}
              >
                {state === "sending"
                  ? t("发送中…")
                  : t("发送 Survey Ready 测试事件")}
              </button>
            </div>
          </Panel>

          <Panel
            title={t("事件投递")}
            description={t("最近 24 小时，按事件和状态聚合。")}
          >
            <div className="sp-table-wrap">
              <table className="sp-table">
                <thead>
                  <tr>
                    <th>{t("事件")}</th>
                    <th>{t("目的地")}</th>
                    <th>{t("状态")}</th>
                    <th>{t("数量")}</th>
                    <th>{t("最近一次")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.length ? (
                    data.events.map((event) => {
                      const status = statusCopy(event.status);
                      return (
                        <tr key={`${event.event}:${event.status}`}>
                          <td>
                            <strong>
                              {eventLabels[event.event] ?? event.event}
                            </strong>
                          </td>
                          <td>Klaviyo</td>
                          <td>
                            <StatusBadge tone={status.tone}>
                              {t(status.label)}
                            </StatusBadge>
                          </td>
                          <td>{number(event.count)}</td>
                          <td className="sp-muted">
                            {event.lastAt
                              ? date(event.lastAt, {
                                  month: "numeric",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="sp-muted">
                        {t("最近 24 小时没有集成事件。")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <aside className="sp-settings-aside">
          <Panel title={t("Shopify 触达状态")}>
            <div className="sp-channel-list">
              {data.placements.length ? (
                data.placements.map((placement) => (
                  <ChannelRow
                    key={placement.surface}
                    name={t(
                      surfaceLabels[placement.surface] ?? placement.surface,
                    )}
                    detail={t("{count} 个 placement", {
                      count: number(placement.total),
                    })}
                    enabled={placement.enabled}
                    total={placement.total}
                  />
                ))
              ) : (
                <p className="sp-muted">{t("尚未创建 placement。")}</p>
              )}
            </div>
          </Panel>
          <Panel title={t("认证边界")}>
            <div className="sp-readiness-list">
              <CheckLine label="Admin · App Bridge session token" />
              <CheckLine label="Checkout · Shopify JWT" />
              <CheckLine label={t("Theme · App Proxy 签名")} />
              <CheckLine label={t("独立链接 · 256-bit token hash")} />
              <CheckLine label="Klaviyo · Bearer + Flow allowlist" />
            </div>
          </Panel>
          <Notice tone="info" title={t("客户身份不落库")}>
            {t(
              "Klaviyo Profile 仅在发送 API 调用期间使用，应用数据库与日志不保存邮箱或电话。",
            )}
          </Notice>
        </aside>
      </div>
    </div>
  );
}

function ConfigRow({ label, ready }: { label: string; ready: boolean }) {
  const { t } = useAdminI18n();
  return (
    <div>
      <span>{label}</span>
      <StatusBadge tone={ready ? "success" : "warning"}>
        {ready ? t("已配置") : t("缺少配置")}
      </StatusBadge>
    </div>
  );
}

function ChannelRow({
  name,
  detail,
  enabled,
  total,
}: {
  name: string;
  detail: string;
  enabled: number;
  total: number;
}) {
  const { t } = useAdminI18n();
  const active = enabled > 0;
  return (
    <div>
      <span className={`sp-channel-dot is-${active ? "success" : "warning"}`} />
      <div>
        <strong>{name}</strong>
        <small>{detail}</small>
      </div>
      <StatusBadge tone={active ? "success" : "neutral"}>
        {active ? t("{enabled}/{total} 启用", { enabled, total }) : t("已关闭")}
      </StatusBadge>
    </div>
  );
}

function CheckLine({ label }: { label: string }) {
  return (
    <div>
      <span className="sp-check-icon is-done" aria-hidden="true">
        ✓
      </span>
      <span>{label}</span>
    </div>
  );
}
