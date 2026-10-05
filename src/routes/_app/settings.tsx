import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTable, useCompany } from "@/lib/fin-data";
import { titleCase, shortDate } from "@/lib/format";
import { PageHeader, Panel, Loading, AutomationNote, Pill } from "@/components/fin/primitives";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

type SettingValue = Json;

const FIELD_LABELS: Record<string, string> = {
  amount: "Amount (AED)",
  percent: "Percentage",
  currency: "Currency",
  enabled: "Requirement",
  above: "Required above (AED)",
  code: "Tax code",
  rate: "Rate",
  period: "Frequency",
  method: "Method",
  start: "Starts",
  end: "Ends",
  email: "Email alerts",
  digest: "Digest frequency",
};

const OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  currency: [{ value: "AED", label: "AED — UAE dirham" }],
  period: [
    { value: "monthly", label: "Monthly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "annually", label: "Annually" },
  ],
  method: [
    { value: "weighted_average", label: "Weighted average" },
    { value: "fifo", label: "First in, first out" },
  ],
  digest: [
    { value: "immediate", label: "Immediately" },
    { value: "daily", label: "Daily digest" },
    { value: "weekly", label: "Weekly digest" },
  ],
};

function settingValue(setting: any, drafts: Record<string, SettingValue>): SettingValue {
  return drafts[setting.id] ?? setting.value;
}

function SettingControl({
  setting,
  drafts,
  setDrafts,
}: {
  setting: any;
  drafts: Record<string, SettingValue>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, SettingValue>>>;
}) {
  const value = settingValue(setting, drafts);
  const setValue = (next: SettingValue) => setDrafts((current) => ({ ...current, [setting.id]: next }));

  if (typeof value === "boolean") {
    return (
      <select value={String(value)} onChange={(event) => setValue(event.target.value === "true")} className="h-8 rounded-md border border-input bg-background px-3 text-[12px]">
        <option value="true">Enabled</option>
        <option value="false">Disabled</option>
      </select>
    );
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(value).map(([key, fieldValue]) => {
          const update = (next: unknown) => setValue({ ...value, [key]: next });
          const options = OPTIONS[key];
          const isDate = key === "start" || key === "end";
          const isPercentageRate = key === "rate";
          return (
            <label key={key} className="space-y-1">
              <span className="text-[11px] text-muted-foreground">{FIELD_LABELS[key] ?? titleCase(key)}</span>
              {typeof fieldValue === "boolean" ? (
                <select value={String(fieldValue)} onChange={(event) => update(event.target.value === "true")} className="h-8 w-full rounded-md border border-input bg-background px-3 text-[12px]">
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              ) : options ? (
                <select value={String(fieldValue)} onChange={(event) => update(event.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-3 text-[12px]">
                  {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : (
                <Input
                  type={isDate ? "date" : typeof fieldValue === "number" ? "number" : "text"}
                  min={typeof fieldValue === "number" ? 0 : undefined}
                  step={key === "percent" || isPercentageRate ? 0.01 : undefined}
                  value={isPercentageRate && typeof fieldValue === "number" ? fieldValue * 100 : String(fieldValue ?? "")}
                  onChange={(event) => update(typeof fieldValue === "number" ? Number(event.target.value) / (isPercentageRate ? 100 : 1) : event.target.value)}
                  className="h-8 text-[12px]"
                />
              )}
            </label>
          );
        })}
      </div>
    );
  }

  if (Array.isArray(value)) {
    return <Input value={value.join(", ")} onChange={(event) => setValue(event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} className="h-8 text-[12px]" />;
  }

  return <Input type={typeof value === "number" ? "number" : "text"} value={String(value ?? "")} onChange={(event) => setValue(typeof value === "number" ? Number(event.target.value) : event.target.value)} className="h-8 text-[12px]" />;
}

export const Route = createFileRoute("/_app/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Qyoo · Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Company profile, tolerances, automation thresholds, tax configuration and team roles for the Qyoo finance workspace.",
      },
      { property: "og:title", content: "Settings · Qyoo" },
      { property: "og:description", content: "Tune what Qyoo decides on its own." },
    ],
  }),
  component: Settings,
});

function Settings() {
  const qc = useQueryClient();
  const { data: company } = useCompany();
  const settings = useTable<any>("settings", ["st"], (q: any) => q.order("group_name"));
  const roles = useTable<any>("profiles", ["st"]);
  const tax = useTable<any>("tax_rates", ["st"]);
  const [drafts, setDrafts] = useState<Record<string, SettingValue>>({});

  const groups = new Map<string, any[]>();
  (settings.data ?? []).forEach((s: any) => {
    groups.set(s.group_name, [...(groups.get(s.group_name) ?? []), s]);
  });

  const save = async (s: any) => {
    const value = drafts[s.id];
    if (value == null) return;
    const { error } = await supabase.from("settings").update({ value }).eq("id", s.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["settings"] });
    toast.success(`${s.label} updated`);
    setDrafts((d) => {
      const n = { ...d };
      delete n[s.id];
      return n;
    });
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Tolerances and thresholds decide what Qyoo handles alone" />

      <AutomationNote>
        Lower a tolerance and more items reach Action Required. Raise it and Qyoo absorbs more
        variance silently. Every change is written to the audit log.
      </AutomationNote>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel title="Company">
          <dl className="space-y-2 px-4 py-3.5 text-[13px]">
            {[
              ["Legal name", company?.legal_name],
              ["Trading name", company?.name],
              ["TRN", company?.trn],
              ["Country", company?.country],
              ["Base currency", company?.currency],
              ["Fiscal year start", shortDate(company?.fiscal_year_start)],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-4 border-b border-border/60 pb-1.5">
                <dt className="text-muted-foreground">{k as string}</dt>
                <dd className="text-right">{(v as string) ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Tax rates">
          <ul className="divide-y divide-border">
            {(tax.data ?? []).map((t: any) => (
              <li key={t.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                <div>
                  <span className="num text-muted-foreground">{t.code}</span> {t.name}
                </div>
                <div className="flex items-center gap-2">
                  <span className="num">{(Number(t.rate) * 100).toFixed(0)}%</span>
                  {t.is_default ? <Pill tone="signal">Default</Pill> : null}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {settings.isLoading ? (
        <Loading />
      ) : (
        Array.from(groups.entries()).map(([group, items]) => (
          <Panel key={group} title={titleCase(group)}>
            <ul className="divide-y divide-border">
              {items.map((s: any) => (
                <li key={s.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(180px,1fr)_minmax(320px,1.2fr)_auto] md:items-end">
                  <div>
                    <div className="text-[13px] font-medium">{s.label}</div>
                    <div className="text-xs text-muted-foreground">{s.description ?? s.key}</div>
                  </div>
                  <SettingControl setting={s} drafts={drafts} setDrafts={setDrafts} />
                  <Button size="sm" variant="outline" disabled={drafts[s.id] == null} onClick={() => save(s)}>
                    Save
                  </Button>
                </li>
              ))}
            </ul>
          </Panel>
        ))
      )}

      <Panel title="Team" description="Roles are enforced in the database, not the browser">
        <ul className="divide-y divide-border">
          {(roles.data ?? []).map((p: any) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
              <div>
                <div className="font-medium">{p.full_name ?? p.email}</div>
                <div className="text-xs text-muted-foreground">{p.email} · {p.job_title ?? "—"}</div>
              </div>
              <Pill>Member</Pill>
            </li>
          ))}
          {(roles.data ?? []).length === 0 ? (
            <li className="px-4 py-6 text-center text-[13px] text-muted-foreground">
              Team members appear here once they sign in.
            </li>
          ) : null}
        </ul>
      </Panel>
    </>
  );
}
