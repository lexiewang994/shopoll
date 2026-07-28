import { useState } from "react";
import {
  Field,
  Notice,
  PageHeader,
  Panel,
  StatusBadge,
  Toggle,
} from "./ShopollUi";

export function SettingsPage() {
  const [contact, setContact] = useState(false);
  const [weekly, setWeekly] = useState(true);
  const [saved, setSaved] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(true);
  return (
    <div className="sp-page-content">
      <PageHeader
        title="设置"
        description="配置语言、数据保留、隐私与内部报告。"
        actions={
          <button
            type="button"
            className="sp-button"
            onClick={() => {
              setSaved(true);
              window.setTimeout(() => setSaved(false), 1600);
            }}
          >
            {saved ? "已保存" : "保存设置"}
          </button>
        }
      />
      {saved ? <Notice tone="success" title="设置已保存" /> : null}
      <div className="sp-settings-layout">
        <div className="sp-settings-main">
          <Panel
            title="店铺与语言"
            description="Shopoll 仅为 Harbor 主站安装。"
          >
            <div className="sp-form-stack">
              <Field label="店铺">
                <input value="shop.harborinno.com" readOnly />
              </Field>
              <div className="sp-field-grid">
                <Field label="管理端语言">
                  <select defaultValue="zh">
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                  </select>
                </Field>
                <Field label="客户问卷默认语言">
                  <select defaultValue="en">
                    <option value="en">English</option>
                    <option value="de">Deutsch</option>
                    <option value="es">Español</option>
                  </select>
                </Field>
              </div>
              <div>
                <span className="sp-field-label">客户问卷启用语言</span>
                <div className="sp-checkbox-grid">
                  <label>
                    <input type="checkbox" checked readOnly /> English{" "}
                    <StatusBadge tone="success">完整</StatusBadge>
                  </label>
                  <label>
                    <input type="checkbox" checked readOnly /> Deutsch{" "}
                    <StatusBadge tone="success">完整</StatusBadge>
                  </label>
                  <label>
                    <input type="checkbox" checked readOnly /> Español{" "}
                    <StatusBadge tone="success">完整</StatusBadge>
                  </label>
                </div>
              </div>
              <Notice tone="info" title="Locale 回退">
                未知或未启用的 locale 始终回退到 English。
              </Notice>
            </div>
          </Panel>

          <Panel
            title="数据保留"
            description="到期数据由后台任务按日清理，并记录审计日志。"
          >
            <div className="sp-retention-grid">
              <Retention
                label="普通回答"
                value="24 个月"
                detail="含题目与选项快照"
              />
              <Retention
                label="订单事实"
                value="24 个月"
                detail="仅去标识化字段"
              />
              <Retention
                label="联系方式答案"
                value="90 天"
                detail="单独加密与访问控制"
              />
              <Retention
                label="卸载后保留"
                value="30 天"
                detail="供导出后永久清除"
              />
            </div>
            <div className="sp-field-grid sp-top-gap">
              <Field label="普通回答（个月）">
                <input type="number" defaultValue="24" min="1" max="36" />
              </Field>
              <Field label="联系方式（天）">
                <input type="number" defaultValue="90" min="7" max="365" />
              </Field>
            </div>
          </Panel>

          <Panel
            title="隐私与同意"
            description="默认不收集姓名、邮箱、电话或地址。"
          >
            <div className="sp-form-stack">
              <Toggle
                checked={contact}
                onChange={setContact}
                label="允许问卷使用联系方式题"
                description="答案单独加密，且需要明确同意文案"
              />
              {contact ? (
                <Notice tone="warning" title="联系方式题已开放">
                  每道联系方式题仍需配置明确同意文案；默认分析与 CSV
                  不含联系方式。
                </Notice>
              ) : null}
              <Toggle
                checked={analyticsConsent}
                onChange={setAnalyticsConsent}
                label="使用 Shopify consent 信号"
                description="无分析同意时，只允许当前页面上下文，不进行跨页归因"
              />
              <Toggle
                checked
                onChange={() => undefined}
                label="在日志中清除 PII"
                description="姓名、邮箱、电话和地址永不写入应用日志"
                disabled
              />
            </div>
          </Panel>

          <Panel
            title="每周报告"
            description="通过 Klaviyo 发送确定性业务摘要。"
          >
            <Toggle
              checked={weekly}
              onChange={setWeekly}
              label="每周一发送报告"
              description="本周 / 上周变化、各产品前三洞察、完成率、NPS 与失败异常"
            />
            {weekly ? (
              <div className="sp-form-stack sp-top-gap">
                <Field label="内部收件人" hint="使用逗号分隔">
                  <input defaultValue="growth@harborinno.com, product@harborinno.com" />
                </Field>
                <div className="sp-field-grid">
                  <Field label="发送时间">
                    <input type="time" defaultValue="09:00" />
                  </Field>
                  <Field label="时区">
                    <select defaultValue="Asia/Shanghai">
                      <option>Asia/Shanghai</option>
                      <option>America/Los_Angeles</option>
                      <option>Europe/Berlin</option>
                    </select>
                  </Field>
                </div>
                <button
                  type="button"
                  className="sp-button sp-button-secondary sp-fit"
                >
                  发送测试报告
                </button>
              </div>
            ) : null}
          </Panel>
        </div>

        <aside className="sp-settings-aside">
          <Panel title="数据边界">
            <div className="sp-readonly-list">
              <div>
                <span>持久化订单字段</span>
                <strong>GID、商品、金额、市场、来源</strong>
              </div>
              <div>
                <span>不持久化</span>
                <strong>姓名、邮箱、电话、地址</strong>
              </div>
              <div>
                <span>联系方式加密</span>
                <strong>AES-256-GCM</strong>
              </div>
              <div>
                <span>邀请 token</span>
                <strong>仅保存 SHA-256 哈希</strong>
              </div>
            </div>
          </Panel>
          <Panel title="隐私请求">
            <div className="sp-channel-list">
              <PrivacyRow name="customers/data_request" status="就绪" />
              <PrivacyRow name="customers/redact" status="就绪" />
              <PrivacyRow name="shop/redact" status="就绪" />
              <PrivacyRow name="app/uninstalled" status="就绪" />
            </div>
          </Panel>
          <Panel title="最近审计记录">
            <div className="sp-audit-list">
              <div>
                <span>10:24</span>
                <p>更新问卷草稿 v4</p>
              </div>
              <div>
                <span>10:18</span>
                <p>发送 Klaviyo 测试事件</p>
              </div>
              <div>
                <span>昨天</span>
                <p>暂停购物车退出问卷</p>
              </div>
            </div>
          </Panel>
          <Notice tone="warning" title="卸载行为">
            卸载后立即停止收集，保留 30 天用于导出，随后永久清除。
          </Notice>
        </aside>
      </div>
    </div>
  );
}

function Retention({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function PrivacyRow({ name, status }: { name: string; status: string }) {
  return (
    <div>
      <span className="sp-channel-dot is-success" />
      <div>
        <strong>{name}</strong>
        <small>已验证 webhook</small>
      </div>
      <StatusBadge tone="success">{status}</StatusBadge>
    </div>
  );
}
