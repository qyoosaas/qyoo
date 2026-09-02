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

export const Route = createFileRoute("/_app/settings")({
  head: () => ({
    meta: [
      { title: "Settings · FIN Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Company profile, tolerances, automation thresholds, tax configuration and team roles for the FIN finance workspace.",
      },
      { property: "og:title", content: "Settings · FIN" },
      { property: "og:description", content: "Tune what FIN decides on its own." },
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
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const groups = new Map<string, any[]>();
  (settings.data ?? []).forEach((s: any) => {
    groups.set(s.group_name, [...(groups.get(s.group_name) ?? []), s]);
  });

  const save = async (s: any) => {
    const raw = drafts[s.id];
    if (raw == null) return;
    let value: any;
    try {
      value = JSON.parse(raw);
    } catch {
      return toast.error("Value must be valid JSON");
    }
    const { error } = await supabase.from("settings").update({ value }).eq("id", s.id);
    if (error) return toast.error(error.message);
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
      <PageHeader title="Settings" subtitle="Tolerances and thresholds decide what FIN handles alone" />

      <AutomationNote>
        Lower a tolerance and more items reach Action Required. Raise it and FIN absorbs more
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
                <li key={s.id} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_320px_auto]">
                  <div>
                    <div className="text-[13px] font-medium">{s.label}</div>
                    <div className="text-xs text-muted-foreground">{s.description ?? s.key}</div>
                  </div>
                  <Input
                    value={drafts[s.id] ?? JSON.stringify(s.value)}
                    onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                    className="num h-8 text-[12px]"
                  />
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
