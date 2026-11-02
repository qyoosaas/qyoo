import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { money, shortDate } from "@/lib/format";
import { PageHeader, Panel, Pill, Metric, Loading, TableShell, Th, Td, EmptyState } from "@/components/fin/primitives";

export const Route = createFileRoute("/_app/notes/$id")({
  head: () => ({
    meta: [
      { title: "Credit / debit note · Qyoo" },
      { name: "description", content: "Credit or debit note detail with lines, applied document and ledger entry." },
      { property: "og:title", content: "Credit / debit note · Qyoo" },
      { property: "og:description", content: "Adjustments that stay traceable." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NoteDetail,
});

function NoteDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["credit_notes", "detail", id],
    queryFn: async () => {
      const db = supabase as any;
      const { data: n } = await db.from("credit_notes").select("*").eq("id", id).maybeSingle();
      if (!n) return null;
      const sales = n.kind === "sales_credit";
      const [items, party, doc, je] = await Promise.all([
        db.from("credit_note_items").select("*").eq("credit_note_id", id),
        db.from(sales ? "customers" : "suppliers").select("id,name").eq("id", sales ? n.customer_id : n.supplier_id).maybeSingle(),
        (sales ? n.invoice_id : n.supplier_bill_id)
          ? db.from(sales ? "invoices" : "supplier_bills").select("id,number").eq("id", sales ? n.invoice_id : n.supplier_bill_id).maybeSingle()
          : Promise.resolve({ data: null }),
        db.from("journal_entries").select("id,number,journal_entry_lines(*)").eq("ref_id", id).maybeSingle(),
      ]);
      return { n, sales, items: items.data ?? [], party: party.data, doc: doc.data, je: je.data };
    },
  });

  if (isLoading) return <Loading rows={8} />;
  if (!data) return <EmptyState title="Note not found" />;
  const { n, sales, items, party, doc, je } = data;
  const back = sales ? { to: "/sales", label: "Sales" } : { to: "/purchases", label: "Purchases" };

  return (
    <>
      <PageHeader title={`${sales ? "Credit note" : "Debit note"} ${n.number}`} subtitle={`${party?.name ?? "—"} · ${shortDate(n.note_date)}`} back={back} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Net" value={money(n.subtotal, true)} />
        <Metric label="VAT" value={money(n.vat, true)} />
        <Metric label="Total" value={money(n.total, true)} />
        <Metric label="Applied" value={money(n.applied, true)} hint={doc ? `To ${doc.number}` : "Not linked"} />
      </div>
      {n.reason ? <Panel title="Reason"><p className="px-4 py-3 text-[13px]">{n.reason}</p></Panel> : null}
      <Panel title="Lines">
        <TableShell>
          <thead><tr><Th>Description</Th><Th right>Qty</Th><Th right>Unit price</Th><Th right>VAT</Th><Th right>Line</Th></tr></thead>
          <tbody>
            {items.map((l: any) => (
              <tr key={l.id}>
                <Td>{l.description ?? "—"}</Td>
                <Td right>{Number(l.quantity)}</Td>
                <Td right>{money(l.unit_price)}</Td>
                <Td right>{(Number(l.vat_rate) * 100).toFixed(0)}%</Td>
                <Td right>{money(l.line_total)}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </Panel>
      {doc ? (
        <Panel title="Applied to">
          <div
            className="row-hover cursor-pointer px-4 py-3 text-[13px] hover:bg-secondary/40"
            onClick={() => (sales ? navigate({ to: "/invoices/$id", params: { id: doc.id } }) : navigate({ to: "/docs/$type/$id", params: { type: "bill", id: doc.id } }))}
          >
            <span className="num font-medium">{doc.number}</span> · {money(n.applied)}
          </div>
        </Panel>
      ) : null}
      {je ? (
        <Panel title={`Journal ${je.number}`} actions={<Pill tone="signal">Posted</Pill>}>
          <TableShell>
            <thead><tr><Th>Account</Th><Th>Description</Th><Th right>Debit</Th><Th right>Credit</Th></tr></thead>
            <tbody>
              {(je.journal_entry_lines ?? []).map((l: any) => (
                <tr key={l.id} className="row-hover cursor-pointer hover:bg-secondary/40" onClick={() => navigate({ to: "/accounting/$code", params: { code: l.account_code } })}>
                  <Td><span className="num text-muted-foreground">{l.account_code}</span> {l.account_name}</Td>
                  <Td>{l.description}</Td>
                  <Td right>{Number(l.debit) ? money(l.debit) : ""}</Td>
                  <Td right>{Number(l.credit) ? money(l.credit) : ""}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </Panel>
      ) : null}
    </>
  );
}
