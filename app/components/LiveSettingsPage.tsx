import { useState } from "react";

import { useAdminI18n, type AdminLocale } from "./AdminI18n";
import type { LiveSettingsView } from "./live-admin-types";
import {
  Field,
  Notice,
  PageHeader,
  Panel,
  StatusBadge,
  Toggle,
} from "./ShopollUi";

async function postJson(
  url: string,
  body: unknown,
  requestFailed: string,
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok)
    throw new Error(payload.error ?? `${requestFailed} (${response.status})`);
}

export function LiveSettingsPage({ initial }: { initial: LiveSettingsView }) {
  const { t, date, setLocale: setActiveLocale } = useAdminI18n();
  const firstReport = initial.reports[0];
  const [adminLocale, setAdminLocale] = useState<AdminLocale>(
    initial.shop.adminLocale === "en" ? "en" : "zh-CN",
  );
  const [defaultLocale, setDefaultLocale] = useState(
    initial.shop.defaultSurveyLocale,
  );
  const [contact, setContact] = useState(initial.shop.contactQuestionsEnabled);
  const [retentionDays, setRetentionDays] = useState(
    initial.shop.retentionDays,
  );
  const [sensitiveRetentionDays, setSensitiveRetentionDays] = useState(
    initial.shop.sensitiveRetentionDays,
  );
  const [timezone, setTimezone] = useState(
    firstReport?.timezone ?? initial.shop.timezone,
  );
  const [weekly, setWeekly] = useState(firstReport?.enabled ?? false);
  const [recipients, setRecipients] = useState(
    initial.reports
      .map((report) => report.email)
      .filter(Boolean)
      .join(", "),
  );
  const [weekday, setWeekday] = useState(firstReport?.weekday ?? 1);
  const [hour, setHour] = useState(firstReport?.hour ?? 9);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "testing">(
    "idle",
  );
  const [error, setError] = useState("");

  const save = async () => {
    setState("saving");
    setError("");
    try {
      await postJson(
        "/app/api/settings",
        {
          adminLocale,
          defaultSurveyLocale: defaultLocale,
          contactQuestionsEnabled: contact,
          timezone,
          retentionDays,
          sensitiveRetentionDays,
          report: {
            emails: recipients
              .split(",")
              .map((email) => email.trim())
              .filter(Boolean),
            locale: adminLocale,
            timezone,
            weekday,
            hour,
            enabled: weekly,
          },
        },
        t("请求失败"),
      );
      setActiveLocale(adminLocale);
      setState("saved");
      window.setTimeout(() => setState("idle"), 1800);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("设置保存失败"));
      setState("idle");
    }
  };

  const testEvent = async () => {
    const email = recipients
      .split(",")
      .map((item) => item.trim())
      .find(Boolean);
    if (!email) {
      setError(t("请先填写一个内部收件人邮箱。"));
      return;
    }
    setState("testing");
    setError("");
    try {
      await postJson(
        "/app/api/integrations/klaviyo/test",
        { email },
        t("请求失败"),
      );
      setState("saved");
      window.setTimeout(() => setState("idle"), 1800);
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
        title={t("设置")}
        description={t("配置语言、数据保留、隐私与内部报告。")}
        actions={
          <button
            type="button"
            className="sp-button"
            disabled={state === "saving"}
            onClick={() => void save()}
          >
            {state === "saving"
              ? t("保存中…")
              : state === "saved"
                ? t("已保存")
                : t("保存设置")}
          </button>
        }
      />
      {state === "saved" ? (
        <Notice tone="success" title={t("操作已完成")}>
          {t("配置已写入数据库，测试事件也会由真实 Klaviyo API 返回结果。")}
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="critical" title={t("操作失败")}>
          {error}
        </Notice>
      ) : null}
      <div className="sp-settings-layout">
        <div className="sp-settings-main">
          <Panel
            title={t("店铺与语言")}
            description={t("此私有 App 只接受 Harbor 配置的店铺域名。")}
          >
            <div className="sp-form-stack">
              <Field label={t("店铺")}>
                <input value={initial.shop.domain} readOnly />
              </Field>
              <div className="sp-field-grid">
                <Field label={t("管理端语言")}>
                  <select
                    value={adminLocale}
                    onChange={(event) =>
                      setAdminLocale(event.currentTarget.value as AdminLocale)
                    }
                  >
                    <option value="zh-CN">{t("中文")}</option>
                    <option value="en">English</option>
                  </select>
                </Field>
                <Field label={t("新问卷默认语言")}>
                  <select
                    value={defaultLocale}
                    onChange={(event) =>
                      setDefaultLocale(event.currentTarget.value)
                    }
                  >
                    <option value="en">English</option>
                    <option value="de">Deutsch</option>
                    <option value="es">Español</option>
                  </select>
                </Field>
              </div>
              <Notice tone="info" title={t("客户问卷语言")}>
                {t(
                  "每个问卷独立启用 English、Deutsch、Español；启用语言缺少文案时无法发布，未知 locale 回退 English。",
                )}
              </Notice>
            </div>
          </Panel>

          <Panel
            title={t("数据保留")}
            description={t("后台任务按各店铺配置删除到期数据。")}
          >
            <div className="sp-field-grid">
              <Field label={t("普通回答与订单事实（天）")}>
                <input
                  type="number"
                  value={retentionDays}
                  min={30}
                  max={3650}
                  onChange={(event) =>
                    setRetentionDays(Number(event.currentTarget.value))
                  }
                />
              </Field>
              <Field label={t("联系方式答案（天）")}>
                <input
                  type="number"
                  value={sensitiveRetentionDays}
                  min={7}
                  max={365}
                  onChange={(event) =>
                    setSensitiveRetentionDays(Number(event.currentTarget.value))
                  }
                />
              </Field>
            </div>
            <Notice tone="warning" title={t("卸载保留期固定为 30 天")}>
              {t(
                "卸载后立即停止收集，30 天后清除店铺数据；该安全上限不能在界面延长。",
              )}
            </Notice>
          </Panel>

          <Panel
            title={t("隐私与同意")}
            description={t("默认不收集姓名、邮箱、电话或地址。")}
          >
            <div className="sp-form-stack">
              <Toggle
                checked={contact}
                onChange={setContact}
                label={t("允许发布联系方式题")}
                description={t(
                  "开启后，每道联系方式题仍必须提供所有启用语言的明确同意文案",
                )}
              />
              {contact ? (
                <Notice tone="warning" title={t("联系方式题已开放")}>
                  {t(
                    "答案单独加密，默认分析与 CSV 始终排除；关闭后，已有问卷仍可编辑但无法重新发布联系方式版本。",
                  )}
                </Notice>
              ) : null}
              <Toggle
                checked
                onChange={() => undefined}
                label={t("遵循 Shopify analytics consent")}
                description={t("未同意分析时不进行跨页行为归因")}
                disabled
              />
              <Toggle
                checked
                onChange={() => undefined}
                label={t("日志清除 PII")}
                description={t("姓名、邮箱、电话、地址和 token 不写入应用日志")}
                disabled
              />
            </div>
          </Panel>

          <Panel
            title={t("客户数据请求导出")}
            description={t(
              "Shopify data_request 生成加密导出，30 天后自动删除。",
            )}
          >
            {initial.privacyExports.length ? (
              <div className="sp-readonly-list">
                {initial.privacyExports.map((item) => (
                  <div key={item.id}>
                    <span>
                      {date(item.createdAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                    <a
                      className="sp-link-button"
                      href={`/app/privacy/${item.id}`}
                    >
                      {t("下载 JSON")}
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <p className="sp-muted">{t("当前没有待下载的数据请求。")}</p>
            )}
          </Panel>

          <Panel
            title={t("每周报告")}
            description={t("Klaviyo 发送确定性摘要，不生成 AI 结论。")}
          >
            <Toggle
              checked={weekly}
              onChange={setWeekly}
              label={t("启用每周报告")}
              description={t(
                "本周 / 上周变化、前三动机 / 渠道 / 阻碍、完成率、NPS 与失败异常",
              )}
            />
            <div className="sp-form-stack sp-top-gap">
              <Field
                label={t("内部收件人")}
                hint={t("多个邮箱用逗号分隔；数据库中仅保存密文")}
              >
                <input
                  type="text"
                  value={recipients}
                  onChange={(event) => setRecipients(event.currentTarget.value)}
                  placeholder="growth@harborinno.com"
                />
              </Field>
              <div className="sp-field-grid">
                <Field label={t("星期")}>
                  <select
                    value={weekday}
                    onChange={(event) =>
                      setWeekday(Number(event.currentTarget.value))
                    }
                  >
                    <option value={1}>{t("周一")}</option>
                    <option value={2}>{t("周二")}</option>
                    <option value={3}>{t("周三")}</option>
                    <option value={4}>{t("周四")}</option>
                    <option value={5}>{t("周五")}</option>
                  </select>
                </Field>
                <Field label={t("发送时间")}>
                  <select
                    value={hour}
                    onChange={(event) =>
                      setHour(Number(event.currentTarget.value))
                    }
                  >
                    {Array.from({ length: 24 }, (_, value) => (
                      <option key={value} value={value}>
                        {String(value).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label={t("时区")}>
                <input
                  value={timezone}
                  onChange={(event) => setTimezone(event.currentTarget.value)}
                />
              </Field>
              <button
                type="button"
                className="sp-button sp-button-secondary sp-fit"
                disabled={!initial.integrations.klaviyo || state === "testing"}
                onClick={() => void testEvent()}
              >
                {state === "testing"
                  ? t("发送中…")
                  : t("发送 Klaviyo 测试事件")}
              </button>
            </div>
          </Panel>
        </div>

        <aside className="sp-settings-aside">
          <Panel title={t("运行配置")}>
            <div className="sp-readonly-list">
              <ConfigRow
                label="Klaviyo API"
                ready={initial.integrations.klaviyo}
              />
              <ConfigRow
                label="Flow webhook"
                ready={initial.integrations.klaviyoFlow}
              />
              <ConfigRow
                label={t("字段加密密钥")}
                ready={initial.integrations.encryption}
              />
            </div>
          </Panel>
          <Panel title={t("数据边界")}>
            <div className="sp-readonly-list">
              <div>
                <span>{t("持久化订单字段")}</span>
                <strong>{t("GID 哈希、商品、金额、市场、来源")}</strong>
              </div>
              <div>
                <span>{t("不持久化")}</span>
                <strong>{t("姓名、邮箱、电话、地址")}</strong>
              </div>
              <div>
                <span>{t("联系方式")}</span>
                <strong>{t("AES-256-GCM 单独加密")}</strong>
              </div>
              <div>
                <span>{t("邀请 token")}</span>
                <strong>{t("仅保存哈希")}</strong>
              </div>
            </div>
          </Panel>
          <Panel title={t("隐私请求")}>
            <div className="sp-channel-list">
              <PrivacyRow name="customers/data_request" />
              <PrivacyRow name="customers/redact" />
              <PrivacyRow name="shop/redact" />
              <PrivacyRow name="app/uninstalled" />
            </div>
          </Panel>
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

function PrivacyRow({ name }: { name: string }) {
  const { t } = useAdminI18n();
  return (
    <div>
      <span className="sp-channel-dot is-success" />
      <div>
        <strong>{name}</strong>
        <small>{t("Shopify 签名验证")}</small>
      </div>
      <StatusBadge tone="success">{t("已注册")}</StatusBadge>
    </div>
  );
}
