-- ============================================================
-- FIN — Autonomous Finance OS : core schema
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- enums ----------
do $$ begin
  create type public.app_role as enum ('admin','finance_manager','accountant','viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.doc_status as enum ('draft','confirmed','posted','partially_paid','paid','cancelled','overdue');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.exception_status as enum ('open','in_review','waiting','resolved','dismissed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.exception_priority as enum ('critical','high','medium','low');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.account_type as enum ('asset','liability','equity','revenue','expense');
exception when duplicate_object then null; end $$;

-- ---------- companies / users ----------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  trn text,
  country text not null default 'United Arab Emirates',
  currency text not null default 'AED',
  fiscal_year_start date not null default '2026-01-01',
  logo_initials text default 'AN',
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key,
  company_id uuid references public.companies(id) on delete cascade,
  full_name text,
  email text,
  job_title text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid references public.companies(id) on delete cascade,
  role public.app_role not null default 'finance_manager',
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- ---------- master data ----------
create table if not exists public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  rate numeric(6,4) not null default 0,
  kind text not null default 'vat',
  is_default boolean not null default false
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  type public.account_type not null,
  subtype text,
  parent_code text,
  is_group boolean not null default false,
  unique (company_id, code)
);

create table if not exists public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  is_closed boolean not null default false
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text,
  name text not null,
  trn text,
  email text,
  phone text,
  address text,
  payment_terms_days int not null default 30,
  credit_limit numeric(16,2) not null default 0,
  opening_balance numeric(16,2) not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text,
  name text not null,
  trn text,
  email text,
  phone text,
  address text,
  payment_terms_days int not null default 30,
  opening_balance numeric(16,2) not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  kind text not null default 'finished_good'
);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  location text
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  category_id uuid references public.product_categories(id),
  sku text not null,
  name text not null,
  kind text not null default 'finished_good',
  unit text not null default 'pcs',
  selling_price numeric(16,2) not null default 0,
  cost numeric(16,2) not null default 0,
  vat_rate numeric(6,4) not null default 0.05,
  reorder_level numeric(16,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  warehouse_id uuid references public.warehouses(id),
  quantity numeric(16,3) not null default 0,
  avg_cost numeric(16,4) not null default 0,
  value numeric(16,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (product_id, warehouse_id)
);

-- ---------- sales ----------
create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  number text not null,
  customer_id uuid not null references public.customers(id),
  order_date date not null,
  expected_delivery date,
  subtotal numeric(16,2) not null default 0,
  discount numeric(16,2) not null default 0,
  vat numeric(16,2) not null default 0,
  total numeric(16,2) not null default 0,
  status public.doc_status not null default 'confirmed',
  created_at timestamptz not null default now()
);

create table if not exists public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  product_id uuid references public.products(id),
  description text,
  quantity numeric(16,3) not null default 1,
  unit_price numeric(16,2) not null default 0,
  discount numeric(16,2) not null default 0,
  vat_rate numeric(6,4) not null default 0.05,
  line_total numeric(16,2) not null default 0
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  number text not null,
  customer_id uuid not null references public.customers(id),
  sales_order_id uuid references public.sales_orders(id),
  invoice_date date not null,
  due_date date not null,
  subtotal numeric(16,2) not null default 0,
  discount numeric(16,2) not null default 0,
  vat numeric(16,2) not null default 0,
  total numeric(16,2) not null default 0,
  amount_paid numeric(16,2) not null default 0,
  balance numeric(16,2) not null default 0,
  cogs numeric(16,2) not null default 0,
  status public.doc_status not null default 'posted',
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_invoices_customer on public.invoices(customer_id);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  product_id uuid references public.products(id),
  description text,
  quantity numeric(16,3) not null default 1,
  unit_price numeric(16,2) not null default 0,
  discount numeric(16,2) not null default 0,
  vat_rate numeric(6,4) not null default 0.05,
  line_total numeric(16,2) not null default 0
);

create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  number text not null,
  customer_id uuid not null references public.customers(id),
  invoice_id uuid references public.invoices(id),
  bank_account_id uuid,
  payment_date date not null,
  amount numeric(16,2) not null,
  method text not null default 'bank_transfer',
  reference text,
  status text not null default 'posted',
  created_at timestamptz not null default now()
);

-- ---------- purchases ----------
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  number text not null,
  supplier_id uuid not null references public.suppliers(id),
  order_date date not null,
  expected_date date,
  subtotal numeric(16,2) not null default 0,
  vat numeric(16,2) not null default 0,
  total numeric(16,2) not null default 0,
  status public.doc_status not null default 'confirmed',
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid references public.products(id),
  description text,
  quantity numeric(16,3) not null default 1,
  unit_price numeric(16,2) not null default 0,
  vat_rate numeric(6,4) not null default 0.05,
  line_total numeric(16,2) not null default 0
);

create table if not exists public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  number text not null,
  purchase_order_id uuid references public.purchase_orders(id),
  supplier_id uuid references public.suppliers(id),
  receipt_date date not null,
  total_value numeric(16,2) not null default 0,
  status text not null default 'received'
);

create table if not exists public.supplier_bills (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  number text not null,
  supplier_ref text,
  supplier_id uuid not null references public.suppliers(id),
  purchase_order_id uuid references public.purchase_orders(id),
  goods_receipt_id uuid references public.goods_receipts(id),
  bill_date date not null,
  due_date date not null,
  subtotal numeric(16,2) not null default 0,
  vat numeric(16,2) not null default 0,
  total numeric(16,2) not null default 0,
  amount_paid numeric(16,2) not null default 0,
  balance numeric(16,2) not null default 0,
  match_status text not null default 'matched',
  status public.doc_status not null default 'posted',
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_bill_items (
  id uuid primary key default gen_random_uuid(),
  supplier_bill_id uuid not null references public.supplier_bills(id) on delete cascade,
  product_id uuid references public.products(id),
  description text,
  quantity numeric(16,3) not null default 1,
  unit_price numeric(16,2) not null default 0,
  vat_rate numeric(6,4) not null default 0.05,
  line_total numeric(16,2) not null default 0
);

create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  number text not null,
  supplier_id uuid not null references public.suppliers(id),
  supplier_bill_id uuid references public.supplier_bills(id),
  bank_account_id uuid,
  payment_date date not null,
  amount numeric(16,2) not null,
  method text not null default 'bank_transfer',
  reference text,
  created_at timestamptz not null default now()
);

-- ---------- banking ----------
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  bank_name text not null,
  account_number_masked text not null,
  iban_masked text,
  currency text not null default 'AED',
  current_balance numeric(16,2) not null default 0,
  ledger_balance numeric(16,2) not null default 0,
  last_synced_at timestamptz,
  reconciliation_status text not null default 'in_progress'
);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  txn_date date not null,
  description text not null,
  normalized_counterparty text,
  reference text,
  direction text not null,
  amount numeric(16,2) not null,
  balance_after numeric(16,2),
  status text not null default 'unmatched',
  match_type text,
  matched_entity_id uuid,
  matched_label text,
  confidence numeric(5,2),
  reconciled boolean not null default false,
  import_batch text,
  created_at timestamptz not null default now()
);
create index if not exists idx_bt_status on public.bank_transactions(status);

create table if not exists public.bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id),
  period_label text not null,
  statement_balance numeric(16,2) not null default 0,
  ledger_balance numeric(16,2) not null default 0,
  difference numeric(16,2) not null default 0,
  matched_count int not null default 0,
  unmatched_count int not null default 0,
  status text not null default 'in_progress',
  created_at timestamptz not null default now()
);

-- ---------- expenses ----------
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  account_code text
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  number text not null,
  merchant text not null,
  expense_date date not null,
  amount numeric(16,2) not null,
  vat numeric(16,2) not null default 0,
  category_id uuid references public.expense_categories(id),
  employee text,
  project text,
  payment_method text not null default 'bank_transfer',
  source text not null default 'manual',
  has_document boolean not null default true,
  status text not null default 'posted',
  created_at timestamptz not null default now()
);

-- ---------- inventory / production ----------
create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id),
  warehouse_id uuid references public.warehouses(id),
  txn_date date not null,
  kind text not null,
  quantity numeric(16,3) not null,
  unit_cost numeric(16,4) not null default 0,
  value numeric(16,2) not null default 0,
  ref_type text,
  ref_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.boms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id),
  name text not null,
  output_quantity numeric(16,3) not null default 1,
  labour_cost numeric(16,2) not null default 0,
  overhead_cost numeric(16,2) not null default 0,
  is_active boolean not null default true
);

create table if not exists public.bom_items (
  id uuid primary key default gen_random_uuid(),
  bom_id uuid not null references public.boms(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity_per_unit numeric(16,4) not null default 1
);

create table if not exists public.production_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  number text not null,
  product_id uuid not null references public.products(id),
  bom_id uuid references public.boms(id),
  quantity numeric(16,3) not null default 1,
  start_date date not null,
  end_date date,
  expected_material_cost numeric(16,2) not null default 0,
  actual_material_cost numeric(16,2) not null default 0,
  expected_total_cost numeric(16,2) not null default 0,
  actual_total_cost numeric(16,2) not null default 0,
  variance numeric(16,2) not null default 0,
  variance_pct numeric(8,3) not null default 0,
  status text not null default 'in_progress',
  created_at timestamptz not null default now()
);

create table if not exists public.production_materials (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid not null references public.production_orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  expected_quantity numeric(16,3) not null default 0,
  actual_quantity numeric(16,3) not null default 0,
  unit_cost numeric(16,4) not null default 0,
  value numeric(16,2) not null default 0
);

create table if not exists public.production_outputs (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid not null references public.production_orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity numeric(16,3) not null default 0,
  unit_cost numeric(16,4) not null default 0,
  value numeric(16,2) not null default 0,
  output_date date not null default current_date
);

-- ---------- accounting ----------
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  number text not null,
  entry_date date not null,
  memo text,
  source text not null default 'system',
  ref_type text,
  ref_id uuid,
  ref_label text,
  total_debit numeric(16,2) not null default 0,
  total_credit numeric(16,2) not null default 0,
  is_reversal boolean not null default false,
  reverses_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_je_ref on public.journal_entries(ref_type, ref_id);

create table if not exists public.journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_code text not null,
  account_name text not null,
  description text,
  debit numeric(16,2) not null default 0,
  credit numeric(16,2) not null default 0
);

-- ---------- documents ----------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  category text not null default 'other',
  mime_type text default 'application/pdf',
  size_kb int default 240,
  storage_path text,
  uploaded_by text,
  extracted jsonb default '{}'::jsonb,
  extraction_status text not null default 'extracted',
  created_at timestamptz not null default now()
);

create table if not exists public.document_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  label text
);

-- ---------- exceptions ----------
create table if not exists public.exceptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  type text not null,
  title text not null,
  priority public.exception_priority not null default 'medium',
  source text not null,
  entity_type text,
  entity_id uuid,
  entity_label text,
  amount numeric(16,2),
  description text,
  reason text,
  recommendation text,
  confidence numeric(5,2),
  history_note text,
  actions jsonb not null default '[]'::jsonb,
  accounting_impact jsonb default '[]'::jsonb,
  status public.exception_status not null default 'open',
  assigned_to text,
  due_date date,
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz not null default now()
);

create table if not exists public.exception_actions (
  id uuid primary key default gen_random_uuid(),
  exception_id uuid not null references public.exceptions(id) on delete cascade,
  action text not null,
  performed_by text,
  notes text,
  journal_entry_id uuid references public.journal_entries(id),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor text not null default 'System',
  action text not null,
  entity_type text,
  entity_id uuid,
  entity_label text,
  before jsonb,
  after jsonb,
  source text not null default 'app',
  created_at timestamptz not null default now()
);

-- ---------- FP&A ----------
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period text not null,
  account_code text not null,
  label text not null,
  amount numeric(16,2) not null default 0
);

create table if not exists public.forecasts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period text not null,
  metric text not null,
  amount numeric(16,2) not null default 0,
  basis text default 'trend'
);

create table if not exists public.cash_forecasts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  forecast_date date not null,
  opening_balance numeric(16,2) not null default 0,
  inflow numeric(16,2) not null default 0,
  outflow numeric(16,2) not null default 0,
  closing_balance numeric(16,2) not null default 0
);

create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  what_changed text,
  why text,
  impact text,
  suggested_action text,
  severity text not null default 'info',
  confidence numeric(5,2) default 90,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  group_name text not null default 'general',
  label text,
  description text,
  unique (company_id, key)
);

create table if not exists public.activity_feed (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null,
  title text not null,
  detail text,
  amount numeric(16,2),
  actor text default 'System',
  entity_type text,
  entity_id uuid,
  created_at timestamptz not null default now()
);

-- ---------- grants + RLS ----------
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('drop policy if exists "authenticated_all" on public.%I', t.tablename);
    execute format('create policy "authenticated_all" on public.%I for all to authenticated using (true) with check (true)', t.tablename);
  end loop;
end $$;