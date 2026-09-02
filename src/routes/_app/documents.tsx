import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTable } from "@/lib/fin-data";
import { shortDate, titleCase } from "@/lib/format";
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
  AutomationNote,
} from "@/components/fin/primitives";
import { Input } from "@/components/ui/input";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/_app/documents")({
  head: () => ({
    meta: [
      { title: "Documents · FIN Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Every invoice, bill, receipt, statement and contract — captured, extracted and linked to its transaction automatically.",
      },
      { property: "og:title", content: "Documents · FIN" },
      { property: "og:description", content: "Paper in, ledger out." },
    ],
  }),
  component: Documents,
});

function Documents() {
  const docs = useTable<any>("documents", ["d"], (q: any) => q.order("created_at", { ascending: false }));
  const [term, setTerm] = useState("");
  const [cat, setCat] = useState("all");
  const [selected, setSelected] = useState<any | null>(null);

  const all = docs.data ?? [];
  const cats = useMemo(() => Array.from(new Set(all.map((d: any) => d.category))).sort(), [all]);
  const extracted = all.filter((d: any) => d.extraction_status === "completed").length;
  const rows = all.filter(
    (d: any) =>
      (cat === "all" || d.category === cat) && d.name.toLowerCase().includes(term.toLowerCase()),
  );

  return (
    <>
      <PageHeader title="Documents" subtitle="Source of truth for every ledger entry" />

      <AutomationNote>
        {all.length} documents ingested. FIN extracted supplier, amounts, VAT and references from{" "}
        {extracted} of them and linked each to its transaction. Drop new files here and they follow the
        same path.
      </AutomationNote>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Documents" value={String(all.length)} hint="All categories" />
        <Metric label="Extracted" value={`${all.length ? ((extracted / all.length) * 100).toFixed(0) : 0}%`} hint="Structured data captured" />
        <Metric label="Categories" value={String(cats.length)} hint="Auto-classified" />
        <Metric label="Storage" value={`${(all.reduce((s: number, d: any) => s + Number(d.size_kb), 0) / 1024).toFixed(1)} MB`} hint="Encrypted at rest" />
      </div>

      <div className="rounded-sm border border-dashed border-border bg-card px-6 py-8 text-center">
        <FileText className="mx-auto h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
        <p className="mt-2 text-[13px]">Drop invoices, receipts or statements here</p>
        <p className="mt-1 text-xs text-muted-foreground">
          PDF, JPG, PNG, XLSX — extracted and matched automatically
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Panel
          title="Library"
          actions={
            <div className="flex items-center gap-2">
              <select
                value={cat}
                onChange={(e) => setCat(e.target.value)}
                className="h-8 rounded-sm border border-border bg-card px-2 text-[13px]"
              >
                <option value="all">All categories</option>
                {cats.map((c) => (
                  <option key={c as string} value={c as string}>
                    {titleCase(c as string)}
                  </option>
                ))}
              </select>
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search…"
                className="h-8 w-[200px] text-[13px]"
              />
            </div>
          }
        >
          {docs.isLoading ? (
            <Loading />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Category</Th>
                  <Th>Uploaded</Th>
                  <Th>By</Th>
                  <Th right>Size</Th>
                  <Th>Extraction</Th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 150).map((d: any) => (
                  <tr
                    key={d.id}
                    onClick={() => setSelected(d)}
                    className={`row-hover cursor-pointer hover:bg-secondary/40 ${selected?.id === d.id ? "bg-secondary/60" : ""}`}
                  >
                    <Td className="max-w-[300px] truncate font-medium">{d.name}</Td>
                    <Td>{titleCase(d.category)}</Td>
                    <Td>{shortDate(d.created_at)}</Td>
                    <Td>{d.uploaded_by}</Td>
                    <Td right>{d.size_kb} KB</Td>
                    <Td>
                      <Pill tone={statusTone(d.extraction_status)}>{titleCase(d.extraction_status)}</Pill>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Panel>

        <Panel title={selected ? "Extracted data" : "Select a document"} description={selected?.name}>
          {selected ? (
            <dl className="space-y-2 px-4 py-3.5 text-[13px]">
              {Object.entries(selected.extracted ?? {}).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-border/60 pb-1.5">
                  <dt className="text-muted-foreground">{titleCase(k)}</dt>
                  <dd className="num truncate text-right">{String(v)}</dd>
                </div>
              ))}
              {Object.keys(selected.extracted ?? {}).length === 0 ? (
                <p className="text-muted-foreground">No structured fields extracted.</p>
              ) : null}
              <div className="pt-2 text-xs text-muted-foreground">
                {selected.mime_type} · {selected.storage_path}
              </div>
            </dl>
          ) : (
            <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
              Extracted fields and links appear here.
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}
