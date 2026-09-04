import { Input } from "@/components/ui/input";
import { NativeSelect } from "./forms";
import { longDate } from "@/lib/format";

export type Period = { from: string; to: string; label: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function presetPeriods(today = new Date()): Period[] {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const q = Math.floor(m / 3);
  const mk = (from: Date, to: Date, label: string): Period => ({ from: iso(from), to: iso(to), label });
  const out: Period[] = [
    mk(new Date(Date.UTC(y, m, 1)), today, "This month"),
    mk(new Date(Date.UTC(y, m - 1, 1)), new Date(Date.UTC(y, m, 0)), "Last month"),
    mk(new Date(Date.UTC(y, q * 3, 1)), today, `Q${q + 1} ${y} to date`),
  ];
  if (q > 0) out.push(mk(new Date(Date.UTC(y, (q - 1) * 3, 1)), new Date(Date.UTC(y, q * 3, 0)), `Q${q} ${y}`));
  out.push(mk(new Date(Date.UTC(y, 0, 1)), today, `FY ${y} to date`));
  out.push(mk(new Date(Date.UTC(y - 1, 0, 1)), new Date(Date.UTC(y - 1, 11, 31)), `FY ${y - 1}`));
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(y, m - i, 1));
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    out.push(mk(d, end > today ? today : end, d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })));
  }
  return out;
}

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const presets = presetPeriods();
  const selected = presets.find((p) => p.from === value.from && p.to === value.to)?.label ?? "custom";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        value={selected}
        onChange={(v) => {
          const p = presets.find((x) => x.label === v);
          if (p) onChange(p);
        }}
        className="w-[190px]"
      >
        {selected === "custom" ? <option value="custom">Custom range</option> : null}
        {presets.map((p) => (
          <option key={p.label} value={p.label}>
            {p.label}
          </option>
        ))}
      </NativeSelect>
      <Input type="date" value={value.from} onChange={(e) => onChange({ from: e.target.value, to: value.to, label: "Custom" })} className="h-8 w-[140px] text-[12px]" />
      <span className="text-xs text-muted-foreground">to</span>
      <Input type="date" value={value.to} onChange={(e) => onChange({ from: value.from, to: e.target.value, label: "Custom" })} className="h-8 w-[140px] text-[12px]" />
    </div>
  );
}

export const periodCaption = (p: Period) => `${longDate(p.from)} – ${longDate(p.to)} · AED`;
