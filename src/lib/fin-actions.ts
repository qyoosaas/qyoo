import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { COMPANY_ID } from "./format";

/** Thin wrappers over the accounting engine RPCs. Every call is one DB transaction. */

export type LineInput = {
  product_id?: string | null;
  description?: string;
  quantity: number;
  unit_price: number;
  discount?: number;
  vat_rate?: number;
};

const rpc = async <T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await (supabase as any).rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
};

export const actions = {
  createInvoice: (p: { customer_id: string; invoice_date: string; due_date?: string | null; items: LineInput[]; notes?: string; post?: boolean }) =>
    rpc<string>("create_invoice", {
      p_company: COMPANY_ID,
      p_customer: p.customer_id,
      p_invoice_date: p.invoice_date,
      p_due_date: p.due_date ?? null,
      p_items: p.items,
      p_notes: p.notes ?? null,
      p_post: p.post ?? true,
    }),
  postDraftInvoice: (id: string) => rpc<string>("post_draft_invoice", { p_invoice: id }),
  recordCustomerPayment: (p: { invoice_id: string; amount: number; date: string; method?: string; bank_account_id?: string | null; reference?: string }) =>
    rpc<string>("record_customer_payment", {
      p_invoice: p.invoice_id,
      p_amount: p.amount,
      p_date: p.date,
      p_method: p.method ?? "bank_transfer",
      p_bank_account: p.bank_account_id ?? null,
      p_reference: p.reference ?? null,
    }),
  createPurchaseOrder: (p: { supplier_id: string; order_date: string; expected_date?: string | null; items: LineInput[] }) =>
    rpc<string>("create_purchase_order", {
      p_company: COMPANY_ID,
      p_supplier: p.supplier_id,
      p_order_date: p.order_date,
      p_expected: p.expected_date ?? null,
      p_items: p.items,
    }),
  createSupplierBill: (p: { supplier_id: string; bill_date: string; due_date?: string | null; items: LineInput[]; supplier_ref?: string; purchase_order_id?: string | null }) =>
    rpc<string>("create_supplier_bill", {
      p_company: COMPANY_ID,
      p_supplier: p.supplier_id,
      p_bill_date: p.bill_date,
      p_due_date: p.due_date ?? null,
      p_items: p.items,
      p_supplier_ref: p.supplier_ref ?? null,
      p_purchase_order: p.purchase_order_id ?? null,
    }),
  recordSupplierPayment: (p: { bill_id: string; amount: number; date: string; method?: string; bank_account_id?: string | null; reference?: string }) =>
    rpc<string>("record_supplier_payment", {
      p_bill: p.bill_id,
      p_amount: p.amount,
      p_date: p.date,
      p_method: p.method ?? "bank_transfer",
      p_bank_account: p.bank_account_id ?? null,
      p_reference: p.reference ?? null,
    }),
  createExpense: (p: { merchant: string; date: string; gross: number; category_id?: string | null; employee?: string; method?: string; has_document?: boolean; project?: string; bank_account_id?: string | null }) =>
    rpc<string>("create_expense", {
      p_company: COMPANY_ID,
      p_merchant: p.merchant,
      p_date: p.date,
      p_gross: p.gross,
      p_category: p.category_id ?? null,
      p_employee: p.employee ?? null,
      p_method: p.method ?? "company_card",
      p_has_document: p.has_document ?? false,
      p_project: p.project ?? null,
      p_bank_account: p.bank_account_id ?? null,
    }),
  voidDocument: (type: "invoice" | "supplier_bill" | "expense" | "purchase_order", id: string, reason?: string) =>
    rpc<void>("void_document", { p_type: type, p_id: id, p_reason: reason ?? "Voided by user" }),
  runAutomation: () => rpc<{ created: number; matched: number; marked_overdue: number }>("run_automation", { p_company: COMPANY_ID }),
  setPeriodClosed: (id: string, closed: boolean) => rpc<void>("set_period_closed", { p_period: id, p_closed: closed }),
  reportPeriod: (from: string, to: string) =>
    rpc<
      { code: string; name: string; type: string; subtype: string | null; opening: number; movement: number; debit: number; credit: number }[]
    >("report_period", { p_company: COMPANY_ID, p_from: from, p_to: to }),
};

/** Generic mutation hook: runs an action, invalidates all cached queries, toasts. */
export function useAction<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  opts: { success?: string | ((r: TResult) => string); onSuccess?: (r: TResult) => void } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r) => {
      await qc.invalidateQueries();
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(r) : opts.success);
      opts.onSuccess?.(r);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Direct table writes for master data (customers, suppliers, products). RLS applies. */
export async function upsertRow(table: string, row: Record<string, unknown>) {
  const payload = { ...row, company_id: COMPANY_ID };
  const q = (supabase as any).from(table);
  const { error } = row.id ? await q.update(payload).eq("id", row.id) : await q.insert(payload);
  if (error) throw new Error(error.message);
}

export async function deleteRow(table: string, id: string) {
  const { error } = await (supabase as any).from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export const isoToday = () => new Date().toISOString().slice(0, 10);
