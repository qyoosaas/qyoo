import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, FileText, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { COMPANY_ID, money, relative, shortDate } from "@/lib/format";
import { processDocument } from "@/lib/doc-intel.functions";
import {
  DOC_TYPES,
  MVP_TYPES,
  STATUS_LABEL,
  docTypeLabel,
  statusToneFor,
  type Extraction,
} from "@/lib/doc-intel";
import {
  PageHeader,
  Panel,
  Pill,
  Metric,
  Loading,
  EmptyState,
  TableShell,
  Th,
  Td,
  Confidence,
  AutomationNote,
} from "@/components/fin/primitives";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { humanError, logTechnical } from "@/lib/fin-errors";

export const Route = createFileRoute("/_app/documents")({
  validateSearch: (search: Record<string, unknown>) => ({ action: typeof search['action'] === "string" ? search['action'] : undefined }),
  head: () => ({
    meta: [
      { title: "Documents · Qyoo · Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Drop any financial document — invoice, purchase order, GRN, bank statement or receipt. Qyoo classifies it, extracts the data, validates the arithmetic and prepares the workflow for your approval.",
      },
      { property: "og:title", content: "Documents · Qyoo" },
      { property: "og:description", content: "Give Qyoo a document and it understands what happened." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Inbox,
});

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.tif,.tiff,.csv,.xlsx,.xls,.tsv,.txt";

export function useDocumentUploads() {
  return useQuery({
    queryKey: ["document_uploads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_uploads")
        .select("*")
        .eq("company_id", COMPANY_ID)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 10_000,
  });
}

function Inbox() {
  const { action } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const uploads = useDocumentUploads();
  const process = useServerFn(processDocument);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string[]>([]);
  const [term, setTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (action === "upload") inputRef.current?.click();
    if (action) navigate({ to: "/documents", search: { action: undefined }, replace: true });
  }, [action, navigate]);

  const ingest = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        const path = `${COMPANY_ID}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        const up = await supabase.storage.from("documents").upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
        if (up.error) throw new Error(up.error.message);

        const { data: row, error } = await supabase
          .from("document_uploads")
          .insert({
            company_id: COMPANY_ID,
            file_name: file.name,
            mime_type: file.type || null,
            size_kb: Math.max(1, Math.round(file.size / 1024)),
            storage_path: path,
            status: "processing",
            uploaded_by: "Ahmed Rahman",
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);

        await supabase.from("document_upload_events").insert({
          document_upload_id: row.id,
          stage: "uploaded",
          detail: `${file.name} received (${Math.round(file.size / 1024)} KB)`,
          actor: "Ahmed Rahman",
        });

        setBusy((b) => [...b, row.id]);
        qc.invalidateQueries({ queryKey: ["document_uploads"] });
        try {
          await process({ data: { id: row.id } });
        } finally {
          setBusy((b) => b.filter((x) => x !== row.id));
          qc.invalidateQueries({ queryKey: ["document_uploads"] });
        }
      }
    },
    onSuccess: () => toast.success("Documents understood — review and approve"),
    onError: (e: Error) => {
      logTechnical("document_ingest", e);
      toast.error(humanError(e), { duration: 8000 });
    },
  });

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length) ingest.mutate(files);
    },
    [ingest],
  );

  const all = uploads.data ?? [];
  const rows = all.filter((d: any) => {
    if (typeFilter !== "all" && d.doc_type !== typeFilter) return false;
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    return d.file_name.toLowerCase().includes(term.toLowerCase());
  });

  const stats = useMemo(() => {
    const needs = all.filter((d: any) => d.status === "needs_review" || d.status === "needs_type").length;
    const ready = all.filter((d: any) => d.status === "ready").length;
    const posted = all.filter((d: any) => d.status === "posted").length;
    const confs = all.filter((d: any) => Number(d.overall_confidence) > 0).map((d: any) => Number(d.overall_confidence));
    return {
      needs,
      ready,
      posted,
      avg: confs.length ? confs.reduce((s: number, n: number) => s + n, 0) / confs.length : 0,
    };
  }, [all]);

  const amountOf = (d: any) => {
    const ex = d.user_corrected_data ?? d.original_extraction;
    const v = (ex as Extraction | null)?.fields?.["total"]?.value;
    return v == null ? null : Number(v);
  };

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Give Qyoo a financial document and it understands what happened"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => uploads.refetch()}
              className="h-8 gap-1.5 text-[13px]"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
              Refresh
            </Button>
            <Button size="sm" className="h-8 text-[13px]" onClick={() => inputRef.current?.click()}>
              Upload documents
            </Button>
          </>
        }
      />

      <AutomationNote>
        Every file runs the same pipeline: understand → structure → match → validate → explain → ask
        for a decision. Nothing reaches the ledger without your approval, and the original extraction is
        never overwritten by your edits.
      </AutomationNote>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Needs review" value={String(stats.needs)} hint="Waiting on a human decision" />
        <Metric label="Ready to post" value={String(stats.ready)} hint="Validated and matched" />
        <Metric label="Posted" value={String(stats.posted)} hint="Converted into a workflow" />
        <Metric label="Avg. extraction confidence" value={`${stats.avg.toFixed(0)}%`} hint="Across processed documents" />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) ingest.mutate(files);
          e.target.value = "";
        }}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-sm border border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? "border-[var(--signal)] bg-signal-soft" : "border-border bg-card"
        }`}
      >
        {ingest.isPending ? (
          <>
            <span className="signal-dot mx-auto block" />
            <p className="mt-3 text-[13px]">Understanding your documents…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Classifying, extracting, matching and validating
            </p>
          </>
        ) : (
          <>
            <Upload className="mx-auto h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            <p className="mt-2 text-[13px]">Drop documents here, or click to choose files</p>
            <p className="mt-1 text-xs text-muted-foreground">
              PDF, JPG, PNG, TIFF, CSV, XLSX — invoices, POs, GRNs, delivery notes, bank statements,
              receipts and credit notes
            </p>
          </>
        )}
      </div>

      <Panel
        title="Documents"
        description={`${rows.length} of ${all.length}`}
        actions={
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 rounded-sm border border-border bg-card px-2 text-[13px]"
            >
              <option value="all">All statuses</option>
              {["processing", "needs_type", "needs_review", "ready", "posted", "failed"].map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s] ?? s}
                </option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-8 rounded-sm border border-border bg-card px-2 text-[13px]"
            >
              <option value="all">All document types</option>
              {DOC_TYPES.filter((t) => MVP_TYPES.includes(t.id)).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search file name…"
              className="h-8 w-[200px] text-[13px]"
            />
          </div>
        }
      >
        {uploads.isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No documents yet"
            hint="Upload an invoice, a bank statement or a receipt and Qyoo will take it from there."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Document</Th>
                <Th>Type</Th>
                <Th>Entity</Th>
                <Th right>Amount</Th>
                <Th>Confidence</Th>
                <Th>Status</Th>
                <Th>Uploaded</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d: any) => {
                const ex = (d.user_corrected_data ?? d.original_extraction) as Extraction | null;
                const entity =
                  ex?.fields?.["supplier_name"]?.value ??
                  ex?.fields?.["customer_name"]?.value ??
                  ex?.fields?.["merchant"]?.value ??
                  ex?.fields?.["bank_name"]?.value ??
                  "—";
                const amount = amountOf(d);
                const working = busy.includes(d.id) || d.status === "processing";
                return (
                  <tr
                    key={d.id}
                    onClick={() => navigate({ to: "/documents/$id", params: { id: d.id } })}
                    className="row-hover cursor-pointer hover:bg-secondary/40"
                  >
                    <Td className="max-w-[280px] truncate font-medium">
                      <span className="inline-flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                        {d.file_name}
                      </span>
                    </Td>
                    <Td>{docTypeLabel(d.doc_type)}</Td>
                    <Td className="max-w-[180px] truncate">{String(entity)}</Td>
                    <Td right>{amount == null ? "—" : money(amount)}</Td>
                    <Td>
                      <Confidence value={Number(d.overall_confidence) || null} />
                    </Td>
                    <Td>
                      <Pill tone={working ? "neutral" : statusToneFor(d.status)}>
                        {working ? "Processing" : STATUS_LABEL[d.status] ?? d.status}
                      </Pill>
                    </Td>
                    <Td>{relative(d.created_at)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Panel>
    </>
  );
}
