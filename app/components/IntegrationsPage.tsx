import { useState } from "react";
import {
  Field,
  Notice,
  PageHeader,
  Panel,
  StatusBadge,
  Toggle,
} from "./ShopollUi";

export function IntegrationsPage() {
  const [connected, setConnected] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testDone, setTestDone] = useState(false);
  const [weekly, setWeekly] = useState(true);
  const runTest = () => {
    setTesting(true);
    window.setTimeout(() => {
      setTesting(false);
      setTestDone(true);
    }, 700);
  };
  return (
    <div className="sp-page-content">
      <PageHeader
        title="集成"
        description="管理 Shopify 触达面、Klaviyo Flow 与事件投递。"
      />
      {testDone ? (
        <Notice tone="success" title="测试事件已发送">
          Klaviyo 接受了 Survey Ready 测试事件。
        </Notice>
      ) : null}
      <div className="sp-settings-layout">
        <div className="sp-settings-main">
          <Panel
            title="Klaviyo"
            description="由 Flow 管理同意、退订、延时与消息模板。"
            action={
              <StatusBadge tone={connected ? "success" : "neutral"}>
                {connected ? "已连接" : "未连接"}
              </StatusBadge>
            }
          >
            <div className="sp-integration-hero">
              <div className="sp-integration-logo">K</div>
              <div>
                <strong>Harbor Innovations Klaviyo</strong>
                <span>Company ID · V8Q••• · 私钥已加密</span>
              </div>
              <button
                type="button"
                className="sp-button sp-button-secondary"
                onClick={() => setConnected((value) => !value)}
              >
                {connected ? "重新连接" : "连接"}
              </button>
            </div>
            <div className="sp-form-stack sp-top-gap">
              <Field label="Flow webhook Bearer secret" hint="仅显示尾 4 位">
                <div className="sp-secret-field">
                  <input value="••••••••••••••••P7k2" readOnly />
                  <button type="button">轮换</button>
                </div>
              </Field>
              <Field
                label="允许的 Flow ID"
                hint="每行一个；其他 Flow 请求返回 403"
              >
                <textarea
                  rows={3}
                  defaultValue={
                    "Rt92Fn · Abandoned cart\nLm18Qs · Post-delivery NPS"
                  }
                />
              </Field>
              <Toggle
                checked={weekly}
                onChange={setWeekly}
                label="通过 Klaviyo 发送每周报告"
                description="确定性展示环比变化、前三动机 / 渠道 / 阻碍、NPS 与异常"
              />
              <div className="sp-button-row">
                <button
                  type="button"
                  className="sp-button"
                  disabled={!connected || testing}
                  onClick={runTest}
                >
                  {testing ? "发送中…" : "发送测试事件"}
                </button>
                <button type="button" className="sp-button sp-button-quiet">
                  查看设置指南
                </button>
              </div>
            </div>
          </Panel>

          <Panel title="事件投递" description="最近 24 小时 · 自动重试失败事件">
            <div className="sp-table-wrap">
              <table className="sp-table">
                <thead>
                  <tr>
                    <th>事件</th>
                    <th>目的地</th>
                    <th>状态</th>
                    <th>数量</th>
                    <th>最近一次</th>
                  </tr>
                </thead>
                <tbody>
                  <EventRow
                    event="Survey Ready"
                    destination="Klaviyo"
                    status="成功"
                    count="184"
                    time="10:18"
                  />
                  <EventRow
                    event="Survey Started"
                    destination="Klaviyo"
                    status="成功"
                    count="121"
                    time="10:17"
                  />
                  <EventRow
                    event="Survey Completed"
                    destination="Klaviyo"
                    status="成功"
                    count="86"
                    time="10:16"
                  />
                  <EventRow
                    event="Reward Issued"
                    destination="Klaviyo"
                    status="未启用"
                    count="0"
                    time="—"
                  />
                  <EventRow
                    event="Shopoll Weekly Report"
                    destination="Klaviyo"
                    status="成功"
                    count="1"
                    time="周一 09:00"
                  />
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <aside className="sp-settings-aside">
          <Panel title="Shopify 渠道状态">
            <div className="sp-channel-list">
              <Channel
                name="Theme app embed"
                detail="站内弹层运行时"
                status="已启用"
                tone="success"
              />
              <Channel
                name="Theme inline block"
                detail="可在主题编辑器添加"
                status="可用"
                tone="success"
              />
              <Channel
                name="Thank you block"
                detail="结账编辑器"
                status="待确认"
                tone="warning"
              />
              <Channel
                name="Order status block"
                detail="客户账户扩展"
                status="待确认"
                tone="warning"
              />
              <Channel
                name="Web Pixel"
                detail="同意感知事件"
                status="已连接"
                tone="success"
              />
              <Channel
                name="App Proxy"
                detail="/apps/shopoll"
                status="已签名"
                tone="success"
              />
            </div>
          </Panel>
          <Panel title="安全边界">
            <div className="sp-readiness-list">
              <CheckLine label="Admin · App Bridge token" />
              <CheckLine label="Checkout · Shopify JWT" />
              <CheckLine label="Theme · App Proxy 签名" />
              <CheckLine label="独立链接 · 256-bit token" />
              <CheckLine label="Klaviyo · Bearer + allowlist" />
            </div>
          </Panel>
          <Notice tone="info" title="不保存客户 PII">
            Klaviyo Profile 仅在发送 API 调用期间存在，不写入数据库或日志。
          </Notice>
        </aside>
      </div>
    </div>
  );
}

function EventRow({
  event,
  destination,
  status,
  count,
  time,
}: Record<string, string>) {
  return (
    <tr>
      <td>
        <strong>{event}</strong>
      </td>
      <td>{destination}</td>
      <td>
        <StatusBadge tone={status === "成功" ? "success" : "neutral"}>
          {status}
        </StatusBadge>
      </td>
      <td>{count}</td>
      <td className="sp-muted">{time}</td>
    </tr>
  );
}
function Channel({
  name,
  detail,
  status,
  tone,
}: {
  name: string;
  detail: string;
  status: string;
  tone: "success" | "warning";
}) {
  return (
    <div>
      <span className={`sp-channel-dot is-${tone}`} />
      <div>
        <strong>{name}</strong>
        <small>{detail}</small>
      </div>
      <StatusBadge tone={tone}>{status}</StatusBadge>
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
