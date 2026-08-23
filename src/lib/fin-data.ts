import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { COMPANY_ID } from "./format";

/** Thin typed helpers over the Finance OS tables. RLS scopes everything to signed-in users. */

async function fetchTable<T = Record<string, unknown>>(
  table: string,
  build?: (q: any) => any,
): Promise<T[]> {
  let q = (supabase.from(table) as any).select("*").eq("company_id", COMPANY_ID);
  if (build) q = build(q);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

export function useTable<T = any>(
  table: string,
  key: unknown[] = [],
  build?: (q: any) => any,
) {
  return useQuery({
    queryKey: [table, ...key],
    queryFn: () => fetchTable<T>(table, build),
    staleTime: 30_000,
  });
}

export function useCompany() {
  return useQuery({
    queryKey: ["company"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", COMPANY_ID)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useExceptions() {
  return useTable<any>("exceptions", ["all"], (q: any) =>
    q.order("priority", { ascending: true }).order("created_at", { ascending: false }),
  );
}

export function useInvoices() {
  return useTable<any>("invoices", ["list"], (q: any) =>
    q.order("invoice_date", { ascending: false }),
  );
}

export function useCustomers() {
  return useTable<any>("customers", ["list"], (q: any) => q.order("name"));
}

export function useSuppliers() {
  return useTable<any>("suppliers", ["list"], (q: any) => q.order("name"));
}

export function useProducts() {
  return useTable<any>("products", ["list"], (q: any) => q.order("sku"));
}

export function useBankTransactions(limit = 400) {
  return useTable<any>("bank_transactions", ["list", limit], (q: any) =>
    q.order("txn_date", { ascending: false }).limit(limit),
  );
}

/** Deterministic rule-based matching engine used for suggestions on unmatched lines. */
export type MatchCandidate = {
  id: string;
  label: string;
  kind: "invoice" | "bill" | "expense" | "transfer";
  amount: number;
  date: string;
  counterparty: string;
  confidence: number;
  reasons: string[];
};

export function rankMatches(
  txn: { amount: number; txn_date: string; description: string; direction: string },
  invoices: any[],
  bills: any[],
): MatchCandidate[] {
  const pool =
    txn.direction === "in"
      ? invoices.map((i) => ({
          id: i.id,
          label: i.number,
          kind: "invoice" as const,
          amount: Number(i.balance || i.total),
          date: i.invoice_date,
          counterparty: i.customer_name ?? "",
        }))
      : bills.map((b) => ({
          id: b.id,
          label: b.number,
          kind: "bill" as const,
          amount: Number(b.balance || b.total),
          date: b.bill_date,
          counterparty: b.supplier_name ?? "",
        }));

  const desc = txn.description.toUpperCase();

  return pool
    .map((c) => {
      const reasons: string[] = [];
      let score = 0;
      const diff = Math.abs(c.amount - txn.amount);
      const rel = c.amount ? diff / c.amount : 1;
      if (diff < 0.01) {
        score += 55;
        reasons.push("Exact amount match");
      } else if (rel <= 0.005) {
        score += 42;
        reasons.push("Amount within 0.5% tolerance");
      } else if (rel <= 0.05) {
        score += 22;
        reasons.push(`Amount differs by ${(rel * 100).toFixed(1)}%`);
      }
      if (desc.includes(c.label)) {
        score += 30;
        reasons.push("Document reference found in description");
      }
      if (c.counterparty && desc.includes(c.counterparty.toUpperCase().slice(0, 10))) {
        score += 12;
        reasons.push("Counterparty name matches");
      }
      const days = Math.abs(
        (new Date(txn.txn_date).getTime() - new Date(c.date).getTime()) / 86400000,
      );
      if (days <= 45) {
        score += Math.max(0, 12 - days / 5);
        reasons.push(`Within ${Math.round(days)} days of document date`);
      }
      return { ...c, confidence: Math.min(99, Math.round(score)), reasons };
    })
    .filter((c) => c.confidence > 20)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
}

export const NAV_LABEL: Record<string, string> = {
  invoice: "Invoice",
  supplier_bill: "Supplier bill",
  expense: "Expense",
  bank_transaction: "Bank transaction",
  product: "Product",
  production_order: "Production order",
  customer: "Customer",
  journal_entry: "Journal entry",
  vat_return: "VAT return",
};
