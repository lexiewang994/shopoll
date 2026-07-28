import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sp-page-header">
      <div className="sp-page-heading">
        {eyebrow ? <div className="sp-eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="sp-page-actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`sp-panel ${className}`}>
      {title || description || action ? (
        <header className="sp-panel-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {action ? <div className="sp-panel-action">{action}</div> : null}
        </header>
      ) : null}
      <div className="sp-panel-body">{children}</div>
    </section>
  );
}

export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: "success" | "warning" | "critical" | "info" | "neutral";
  children: ReactNode;
}) {
  return <span className={`sp-badge sp-badge-${tone}`}>{children}</span>;
}

export function MetricCard({
  label,
  value,
  delta,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  delta?: string;
  detail?: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  return (
    <article className="sp-metric">
      <div className="sp-metric-label">{label}</div>
      <div className="sp-metric-row">
        <strong>{value}</strong>
        {delta ? (
          <span className={`sp-delta sp-delta-${tone}`}>{delta}</span>
        ) : null}
      </div>
      {detail ? <div className="sp-metric-detail">{detail}</div> : null}
    </article>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="sp-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={value === option.value ? "is-active" : ""}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`sp-toggle-row ${disabled ? "is-disabled" : ""}`}>
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <span className="sp-switch">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span aria-hidden="true" />
      </span>
    </label>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`sp-field ${className}`}>
      <span className="sp-field-label">{label}</span>
      {children}
      {hint ? <span className="sp-field-hint">{hint}</span> : null}
    </label>
  );
}

export function ProgressBar({
  value,
  tone = "green",
}: {
  value: number;
  tone?: string;
}) {
  return (
    <span className="sp-progress" aria-label={`${value}%`}>
      <span
        className={`sp-progress-fill sp-fill-${tone}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </span>
  );
}

export function HorizontalBars({
  rows,
  format = "percent",
}: {
  rows: readonly {
    label: string;
    value: number;
    count?: number;
    color?: string;
  }[];
  format?: "percent" | "number";
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="sp-bars">
      {rows.map((row) => (
        <div className="sp-bar-row" key={row.label}>
          <div className="sp-bar-label">
            <span>{row.label}</span>
            <strong>
              {format === "percent"
                ? `${row.value}%`
                : row.value.toLocaleString()}
            </strong>
          </div>
          <div className="sp-bar-track">
            <span
              className={`sp-bar-fill sp-fill-${row.color ?? "blue"}`}
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
          {typeof row.count === "number" ? (
            <small>{row.count.toLocaleString()} 份回答</small>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function SparkBars({ values }: { values: readonly number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="sp-spark" aria-label="最近 14 天完成量趋势">
      {values.map((value, index) => (
        <span
          key={`${index}-${value}`}
          style={{ height: `${Math.max(8, (value / max) * 100)}%` }}
          title={`${value} 份`}
        />
      ))}
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "success" | "critical";
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`sp-notice sp-notice-${tone}`}
      role={tone === "critical" ? "alert" : "status"}
    >
      <span className="sp-notice-marker" aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {children ? <p>{children}</p> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="sp-empty">
      <div className="sp-empty-mark" aria-hidden="true">
        +
      </div>
      <strong>{title}</strong>
      <p>{detail}</p>
      {action}
    </div>
  );
}
