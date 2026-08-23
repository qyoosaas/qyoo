import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div>
        <h1 className="text-[22px] font-medium tracking-tight text-foreground">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("panel overflow-hidden", className)}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-[13px] font-medium text-foreground">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
  );
}

export function Metric({
  label,
  value,
  hint,
  trend,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  trend?: { value: string; direction: "up" | "down" | "flat" };
  accent?: boolean;
}) {
  return (
    <div className="panel px-4 py-3.5">
      <div className="label-xs">{label}</div>
      <div
        className={cn(
          "num mt-2 text-[21px] font-medium tracking-tight",
          accent ? "text-foreground" : "text-foreground",
        )}
      >
        {value}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        {trend ? (
          <span
            className={cn(
              "num font-medium",
              trend.direction === "up" && "text-success",
              trend.direction === "down" && "text-critical",
              trend.direction === "flat" && "text-muted-foreground",
            )}
          >
            {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"} {trend.value}
          </span>
        ) : null}
        {hint ? <span>{hint}</span> : null}
      </div>
    </div>
  );
}

const toneMap = {
  neutral: "bg-secondary text-foreground border-border",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  critical: "bg-critical-soft text-critical border-transparent",
  signal: "bg-signal-soft text-foreground border-transparent",
  muted: "bg-transparent text-muted-foreground border-border",
} as const;

export type Tone = keyof typeof toneMap;

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        toneMap[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status?: string | null): Tone {
  switch (status) {
    case "paid":
    case "resolved":
    case "matched":
    case "completed":
    case "reconciled":
    case "posted":
    case "received":
    case "active":
      return "success";
    case "partially_paid":
    case "suggested":
    case "in_review":
    case "review":
    case "waiting":
    case "in_progress":
    case "draft":
    case "mismatch":
      return "warning";
    case "overdue":
    case "critical":
    case "unmatched":
      return "critical";
    default:
      return "neutral";
  }
}

export function Confidence({ value }: { value?: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>;
  const v = Number(value);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor:
            v >= 90 ? "var(--signal)" : v >= 70 ? "var(--warning)" : "var(--muted-foreground)",
        }}
      />
      <span className="num text-xs text-muted-foreground">{v.toFixed(0)}%</span>
    </span>
  );
}

export function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th
      className={cn(
        "label-xs border-b border-border px-4 py-2.5 text-left font-medium",
        right && "text-right",
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  right,
  className,
}: {
  children: ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "border-b border-border/70 px-4 py-2.5 text-[13px] text-foreground",
        right && "num text-right",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">{children}</table>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 py-14 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Loading({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-px p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-8 animate-pulse rounded-sm bg-secondary" />
      ))}
    </div>
  );
}

export function AutomationNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-sm border border-border bg-signal-soft/60 px-3 py-2.5">
      <span className="signal-dot mt-1.5 shrink-0" />
      <p className="text-[12.5px] leading-relaxed text-foreground">{children}</p>
    </div>
  );
}
