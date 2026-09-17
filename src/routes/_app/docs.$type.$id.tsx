import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { money, shortDate, titleCase } from "@/lib/format";
import {
  PageHeader,
  Panel,
  Pill,
  Metric,
  Loading,
  TableShell,
  Th,
  Td,
  statusTone,
} from "@/components/fin/primitives";
import { EditDocDialog } from "@/components/fin/forms";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/docs/$type/$id")({
  head: () => ({
    meta: [
      { title: "Document · FIN Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Full detail for a delivery note, goods receipt, supplier bill, receipt or payment, including lines, linked documents and audit trail.",
      },
      { property: "og:title", content: "Document · FIN" },
      { property: "og:description", content: "Every document opens on its own page." },
    ],
  }),
  component: DocPage,
});

type Cfg = {
  table: string;
  docType: string;
  title: string;
  items?: { table: string; fk: string };
  dateField: string;
  amountField: string;
  amountLabel: string;
  party?: { table: string; fk: string; label: string };
  back: { to: string; label: string };
};

const CFG: Record<string, Cfg> = {
  dn: {
    table: "delivery_notes",
    docType: "delivery_note",
    title: "Delivery note",
    items: { table: "delivery_note_items", fk: "delivery_note_id" },
    dateField: "delivery_date",
    amountField: "total_value",
    amountLabel: "Goods value",
    party: { table: "customers", fk: "customer_id", label: "Customer" },
    back: { to: "/sales", label: "Sales" },
  },
  grn: {
    table: "goods_receipts",
    docType: "goods_receipt",
    title: "Goods receipt",
    items: { table: "goods_receipt_items", fk: "goods_receipt_id" },
    dateField: "receipt_date",
    amountField: "total_value",
    amountLabel: "Goods value",
    party: { table: "suppliers", fk: "supplier_id", label: "Supplier" },
    back: { to: "/purchases", label: "Purchases" },
  },
  bill: {
    table: "supplier_bills",
    docType: "supplier_bill",
    title: "Supplier bill",
    items: { table: "supplier_bill_items", fk: "supplier_bill_id" },
    dateField: "bill_date",
    amountField: "total",
    amountLabel: "Bill total",
    party: { table: "suppliers", fk: "supplier_id", label: "Supplier" },
    back: { to: "/purchases", label: "Purchases" },
  },
  payment: {
    table: "supplier_payments",
    docType: "supplier_payment",
    title: "Supplier payment",
    dateField: "payment_date",
    amountField: "amount",
    amountLabel: "Amount paid",
    party: { table: "suppliers", fk: "supplier_id", label: "Supplier" },
    back: { to: "/purchases", label: "Purchases" },
  },
  receipt: {
    table: "customer_payments",
    docType: "customer_payment",
    title: "Customer receipt",
    dateField: "payment_date",
    amountField: "amount",
    amountLabel: "Amount received",
    party: { table: "customers", fk: "customer_id", label: "Customer" },
    back: { to: "/sales", label: "Sales" },
  },
};

function DocPage() {
  const { type, id } = useParams({ from: "/_app/docs/$type/$id" });
  const cfg = CFG[type];
  const [editing, setEditing] = useState<any | null>(null);

  const doc = useQuery({
    queryKey: ["doc", type, id],
    enabled: !!cfg,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from(cfg!.table).select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const lines = useQuery({
    queryKey: ["doc-lines", type, id],
    enabled: !!cfg?.items,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from(cfg!.items!.table)
        .select("*")
        .eq(cfg!.items!.fk, id);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const party = useQuery({
    queryKey: ["doc-party", type, id, doc.data?.[cfg?.party?.fk ?? ""]],
    enabled: !!cfg?.party && !!doc.data?.[cfg?.party?.fk ?? ""],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from(cfg!.party!.table)
        .select("*")
        .eq("id", doc.data[cfg!.party!.fk])
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const audit = useQuery({
    queryKey: ["doc-audit", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("audit_logs")
        .select("*")
        .eq("entity_id", id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  if (!cfg) {
    return (
      <Panel title="Unknown document type">
        <p className="p-4 text-[13px] text-muted-foreground">
          That document type is not recognised.{" "}
          <Link to="/overview" className="underline underline-offset-4">
            Back to the overview
          </Link>
          .
        </p>
      </Panel>
    );
  }

  if (doc.isLoading) return <Loading rows={8} />;
  const d = doc.data;
  if (!d) {
    return (
      <Panel title={`${cfg.title} not found`}>
        <p className="p-4 text-[13px] text-muted-foreground">
          This document no longer exists.{" "}
          <Link to={cfg.back.to} className="underline underline-offset-4">
            Back to {cfg.back.label}
          </Link>
          .
        </p>
      </Panel>
    );
  }

  return (
    <>
      <PageHeader
        title={`${cfg.title} · ${d.number}`}
        subtitle={`${shortDate(d[cfg.dateField])}${party.data ? ` · ${party.data.name}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Link to={cfg.back.to}>
              <Button variant="ghost" size="sm">
                Back to {cfg.back.label}
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={() => setEditing(d)} title="Edit this document">
              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={cfg.amountLabel} value={money(d[cfg.amountField], true)} hint={d.number} />
        <Metric label="Date" value={shortDate(d[cfg.dateField])} hint={titleCase(String(d.status ?? "posted"))} />
        {d.balance !== undefined ? (
          <Metric label="Open balance" value={money(d.balance, true)} hint={`Paid ${money(d.amount_paid ?? 0)}`} />
        ) : null}
        {cfg.party ? (
          <Metric label={cfg.party.label} value={party.data?.name ?? "—"} hint={party.data?.trn ?? ""} />
        ) : null}
      </div>

      {cfg.items ? (
        <Panel title="Lines" description={`${(lines.data ?? []).length} line(s)`}>
          <TableShell>
            <thead>
              <tr>
                <Th>Description</Th>
                <Th right>Quantity</Th>
                <Th right>Unit</Th>
                <Th right>Value</Th>
              </tr>
            </thead>
            <tbody>
              {(lines.data ?? []).map((l: any) => (
                <tr key={l.id}>
                  <Td>{l.description ?? "—"}</Td>
                  <Td right>{Number(l.quantity).toLocaleString()}</Td>
                  <Td right>{money(l.unit_cost ?? l.unit_price ?? 0)}</Td>
                  <Td right>{money(l.value ?? l.line_total ?? 0)}</Td>
                </tr>
              ))}
              {(lines.data ?? []).length === 0 ? (
                <tr>
                  <Td>No lines recorded on this document.</Td>
                  <Td right>—</Td>
                  <Td right>—</Td>
                  <Td right>—</Td>
                </tr>
              ) : null}
            </tbody>
          </TableShell>
        </Panel>
      ) : null}

      <Panel title="Details">
        <dl className="grid gap-x-8 gap-y-2 p-4 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(d)
            .filter(([k]) => !["id", "company_id"].includes(k) && !k.endsWith("_id"))
            .map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-1">
                <dt className="label-xs">{titleCase(k.replace(/_/g, " "))}</dt>
                <dd className="num text-right">
                  {k === "status" ? (
                    <Pill tone={statusTone(String(v))}>{titleCase(String(v))}</Pill>
                  ) : v === null || v === "" ? (
                    "—"
                  ) : typeof v === "number" ? (
                    money(v)
                  ) : (
                    String(v).slice(0, 40)
                  )}
                </dd>
              </div>
            ))}
        </dl>
      </Panel>

      <Panel title="Audit trail" description="Everything recorded against this document">
        <TableShell>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Action</Th>
              <Th>Actor</Th>
              <Th>Source</Th>
            </tr>
          </thead>
          <tbody>
            {(audit.data ?? []).map((a: any) => (
              <tr key={a.id}>
                <Td>{shortDate(a.created_at)}</Td>
                <Td>{a.action}</Td>
                <Td>{a.actor}</Td>
                <Td>{titleCase(a.source)}</Td>
              </tr>
            ))}
            {(audit.data ?? []).length === 0 ? (
              <tr>
                <Td>No audit entries yet.</Td>
                <Td>—</Td>
                <Td>—</Td>
                <Td>—</Td>
              </tr>
            ) : null}
          </tbody>
        </TableShell>
      </Panel>

      <EditDocDialog type={cfg.docType} row={editing} onOpenChange={(v) => !v && setEditing(null)} />
    </>
  );
}
