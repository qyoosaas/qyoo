export const COMPANY_ID = "a0000000-0000-4000-8000-000000000001";
export const TODAY = new Date("2026-08-19T00:00:00Z");

const aed = new Intl.NumberFormat("en-AE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compact = new Intl.NumberFormat("en-AE", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function money(value: number | string | null | undefined, withCurrency = false) {
  const n = Number(value ?? 0);
  return `${withCurrency ? "AED " : ""}${aed.format(n)}`;
}

export function moneyShort(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (Math.abs(n) >= 1000) return compact.format(n).replace("K", "k");
  return aed.format(n);
}

export function num(value: number | string | null | undefined, digits = 0) {
  return new Intl.NumberFormat("en-AE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value ?? 0));
}

export function pct(value: number | null | undefined, digits = 1) {
  return `${Number(value ?? 0).toFixed(digits)}%`;
}

export function shortDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

export function longDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

export function relative(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return shortDate(d);
}

export function daysBetween(a: string | Date, b: string | Date = TODAY) {
  const d1 = typeof a === "string" ? new Date(a) : a;
  const d2 = typeof b === "string" ? new Date(b) : b;
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function titleCase(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
