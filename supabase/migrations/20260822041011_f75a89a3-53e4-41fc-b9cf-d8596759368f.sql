do $seed$
declare
  co uuid := 'a0000000-0000-4000-8000-000000000001';
  custs uuid[]; sups uuid[]; fgs uuid[]; rms uuid[];
  ba_op uuid; ba_col uuid; ba_pay uuid;
  wh_fg uuid; wh_rm uuid;
  i int; j int;
  v_cust uuid; v_sup uuid; v_prod uuid;
  v_inv uuid; v_so uuid; v_pay uuid; v_po uuid; v_gr uuid; v_bill uuid; v_sp uuid; v_exp uuid;
  d date; due date;
  sub numeric; disc numeric; vat numeric; tot numeric; cogs numeric; amt numeric;
  qty numeric; price numeric;
  cust_name text; sup_name text;
  v_bom uuid; v_po2 uuid; exp_cost numeric; act_cost numeric;
  today date := date '2026-08-19';
begin
  select array_agg(id order by code) into custs from public.customers where company_id = co;
  select array_agg(id order by code) into sups from public.suppliers where company_id = co;
  select array_agg(id order by sku) into fgs from public.products where company_id = co and kind = 'finished_good';
  select array_agg(id order by sku) into rms from public.products where company_id = co and kind = 'raw_material';
  select id into ba_op from public.bank_accounts where company_id = co and name = 'Operating Account';
  select id into ba_col from public.bank_accounts where company_id = co and name = 'Collections Account';
  select id into ba_pay from public.bank_accounts where company_id = co and name = 'Payroll Account';
  select id into wh_fg from public.warehouses where company_id = co and code = 'WH-JAF';
  select id into wh_rm from public.warehouses where company_id = co and code = 'WH-SHJ';

  for i in 1..130 loop
    v_cust := custs[1 + ((i * 7) % 20)];
    d := date '2026-01-05' + ((i - 1) * 17 / 10);
    sub := 8000 + ((i * 3571) % 42000);
    disc := case when i % 9 = 0 then round(sub * 0.03, 2) else 0 end;

    if i = 92 then
      v_cust := custs[1]; sub := 23809.52; disc := 0;
      d := today - 26;
    end if;

    vat := round((sub - disc) * 0.05, 2);
    tot := sub - disc + vat;
    cogs := round(sub * 0.66, 2);
    select name, payment_terms_days into cust_name, j from public.customers where id = v_cust;
    due := d + j;

    insert into public.sales_orders (company_id, number, customer_id, order_date, expected_delivery, subtotal, discount, vat, total, status)
    values (co, 'SO-'||(20400 + i), v_cust, d - 6, d + 3, sub, disc, vat, tot, 'confirmed'::public.doc_status) returning id into v_so;

    insert into public.invoices (company_id, number, customer_id, sales_order_id, invoice_date, due_date,
      subtotal, discount, vat, total, amount_paid, balance, cogs, status, notes)
    values (co, 'INV-'||(10400 + i), v_cust, v_so, d, due, sub, disc, vat, tot, 0, tot, cogs, 'posted'::public.doc_status,
      'Delivery to '||cust_name||'. Payment terms '||j||' days.')
    returning id into v_inv;

    for j in 1..2 loop
      v_prod := fgs[1 + ((i * 3 + j) % array_length(fgs,1))];
      select selling_price into price from public.products where id = v_prod;
      qty := greatest(1, round((sub / 2) / greatest(price, 1)));
      insert into public.invoice_items (invoice_id, product_id, description, quantity, unit_price, discount, vat_rate, line_total)
      select v_inv, v_prod, name, qty, price, round(disc/2,2), 0.05, round(qty * price, 2) from public.products where id = v_prod;
      insert into public.sales_order_items (sales_order_id, product_id, description, quantity, unit_price, discount, vat_rate, line_total)
      select v_so, v_prod, name, qty, price, round(disc/2,2), 0.05, round(qty * price, 2) from public.products where id = v_prod;
    end loop;

    perform public.post_invoice(v_inv);

    insert into public.inventory_transactions (company_id, product_id, warehouse_id, txn_date, kind, quantity, unit_cost, value, ref_type, ref_id)
    select co, ii.product_id, wh_fg, d, 'sales_issue', -ii.quantity, p.cost, round(ii.quantity * p.cost, 2), 'invoice', v_inv
    from public.invoice_items ii join public.products p on p.id = ii.product_id where ii.invoice_id = v_inv;

    if i = 92 then
      amt := 24850;
    elsif i % 13 = 0 then
      amt := 0;
    elsif i % 7 = 0 then
      amt := round(tot * 0.6, 2);
    elsif due <= today then
      amt := tot;
    elsif i % 3 = 0 then
      amt := tot;
    else
      amt := 0;
    end if;

    if amt > 0 then
      insert into public.customer_payments (company_id, number, customer_id, invoice_id, bank_account_id, payment_date, amount, method, reference)
      values (co, 'RCP-'||(30400 + i), v_cust, v_inv, ba_col, least(due, today) - (i % 4), amt, 'bank_transfer', 'INV-'||(10400 + i))
      returning id into v_pay;
      perform public.post_customer_payment(v_pay);
    end if;

    update public.invoices set status = 'overdue'::public.doc_status
      where id = v_inv and balance > 0 and due_date < today and status <> 'paid'::public.doc_status;
  end loop;

  for i in 1..60 loop
    v_sup := sups[1 + ((i * 5) % 15)];
    d := date '2026-01-08' + ((i - 1) * 37 / 10);
    sub := 6000 + ((i * 2777) % 48000);
    if i = 17 then sub := 42500 / 1.05; end if;
    vat := round(sub * 0.05, 2);
    tot := round(sub + vat, 2);
    select name, payment_terms_days into sup_name, j from public.suppliers where id = v_sup;

    insert into public.purchase_orders (company_id, number, supplier_id, order_date, expected_date, subtotal, vat, total, status)
    values (co, 'PO-'||(50100 + i), v_sup, d - 10, d, round(sub,2), vat, tot, 'confirmed'::public.doc_status) returning id into v_po;

    for j in 1..2 loop
      v_prod := rms[1 + ((i * 2 + j) % array_length(rms,1))];
      select cost into price from public.products where id = v_prod;
      qty := greatest(1, round((sub / 2) / greatest(price, 1)));
      insert into public.purchase_order_items (purchase_order_id, product_id, description, quantity, unit_price, vat_rate, line_total)
      select v_po, v_prod, name, qty, price, 0.05, round(qty * price, 2) from public.products where id = v_prod;
    end loop;

    insert into public.goods_receipts (company_id, number, purchase_order_id, supplier_id, receipt_date, total_value, status)
    values (co, 'GRN-'||(60100 + i), v_po, v_sup, d + 2, tot, 'received') returning id into v_gr;

    if i = 17 then
      sub := 43250 / 1.05; vat := round(sub * 0.05, 2); tot := 43250;
    end if;
    select payment_terms_days into j from public.suppliers where id = v_sup;

    insert into public.supplier_bills (company_id, number, supplier_ref, supplier_id, purchase_order_id, goods_receipt_id,
      bill_date, due_date, subtotal, vat, total, amount_paid, balance, match_status, status)
    values (co, 'BILL-'||(70100 + i), 'SI/'||(2026000 + i * 13), v_sup, v_po, v_gr, d + 3, d + 3 + j,
      round(sub,2), vat, round(tot,2), 0, round(tot,2),
      case when i = 17 then 'mismatch' else 'matched' end,
      (case when i = 17 then 'draft' else 'posted' end)::public.doc_status)
    returning id into v_bill;

    insert into public.supplier_bill_items (supplier_bill_id, product_id, description, quantity, unit_price, vat_rate, line_total)
    select v_bill, poi.product_id, poi.description, poi.quantity, poi.unit_price, 0.05, poi.line_total
    from public.purchase_order_items poi where poi.purchase_order_id = v_po;

    if i <> 17 then
      perform public.post_supplier_bill(v_bill);

      insert into public.inventory_transactions (company_id, product_id, warehouse_id, txn_date, kind, quantity, unit_cost, value, ref_type, ref_id)
      select co, bi.product_id, wh_rm, d + 2, 'purchase_receipt', bi.quantity, bi.unit_price, bi.line_total, 'supplier_bill', v_bill
      from public.supplier_bill_items bi where bi.supplier_bill_id = v_bill;

      if (d + 3 + j) <= today and i % 8 <> 0 then
        insert into public.supplier_payments (company_id, number, supplier_id, supplier_bill_id, bank_account_id, payment_date, amount, method, reference)
        values (co, 'PMT-'||(80100 + i), v_sup, v_bill, ba_op, d + 3 + j, round(tot,2), 'bank_transfer', 'BILL-'||(70100 + i))
        returning id into v_sp;
        perform public.post_supplier_payment(v_sp);
      end if;
    end if;
  end loop;

  v_sup := sups[4];
  insert into public.supplier_bills (company_id, number, supplier_ref, supplier_id, bill_date, due_date, subtotal, vat, total, amount_paid, balance, match_status, status)
  values (co, 'BILL-70199', 'SI/2026991', v_sup, today - 34, today - 4, round(18000/1.05,2), round(18000 - 18000/1.05,2), 18000, 0, 18000, 'matched', 'posted'::public.doc_status)
  returning id into v_bill;
  perform public.post_supplier_bill(v_bill);
  insert into public.supplier_payments (company_id, number, supplier_id, supplier_bill_id, bank_account_id, payment_date, amount, method, reference)
  values (co, 'PMT-80199', v_sup, v_bill, ba_op, today - 6, 18420, 'bank_transfer', 'BILL-70199') returning id into v_sp;
  perform public.post_supplier_payment(v_sp);
  update public.supplier_bills set amount_paid = 18420, balance = -420, status = 'paid'::public.doc_status where id = v_bill;

  for i in 1..90 loop
    d := date '2026-01-06' + ((i - 1) * 25 / 10);
    amt := 180 + ((i * 977) % 5400);
    insert into public.expenses (company_id, number, merchant, expense_date, amount, vat, category_id, employee, project, payment_method, source, has_document)
    values (co, 'EXP-'||(90100 + i),
      (array['ADNOC Distribution','Emirates Post','Careem Business','Dubai Electricity & Water','Etisalat Business','Al Maya Supplies','Jumbo Electronics','Gulf Tools Trading','Sharaf DG Business','Dulsco Waste Services','Emirates Transport','Al Futtaim Motors Service'])[1 + (i % 12)],
      d, amt, round(amt * 0.05, 2),
      (select id from public.expense_categories where company_id = co offset (i % 9) limit 1),
      (array['Ahmed Rahman','Fatima Al Suwaidi','Rajesh Menon','Layla Haddad','Omar Farouk'])[1 + (i % 5)],
      (array['Plant Upgrade 2026','General','Line 3 Retooling','Export Programme'])[1 + (i % 4)],
      case when i % 5 = 0 then 'company_card' else 'bank_transfer' end,
      case when i % 5 = 0 then 'card' else 'manual' end,
      i <> 44)
    returning id into v_exp;
    perform public.post_expense(v_exp);
  end loop;
  update public.expenses set amount = 1280, vat = 64, merchant = 'Gulf Tools Trading', has_document = false where number = 'EXP-90144';

  insert into public.bank_transactions (company_id, bank_account_id, txn_date, description, normalized_counterparty, reference, direction, amount, status, match_type, matched_entity_id, matched_label, confidence, reconciled, import_batch)
  select co, ba_col, cp.payment_date,
    'INWARD TT '||upper(c.name)||' REF '||coalesce(cp.reference,''), c.name, cp.reference, 'in', cp.amount,
    'matched', 'invoice', cp.invoice_id, i.number, 97 + (abs(hashtext(cp.number)) % 3), true, 'STMT-2026-08'
  from public.customer_payments cp
  join public.customers c on c.id = cp.customer_id
  left join public.invoices i on i.id = cp.invoice_id
  where cp.company_id = co;

  insert into public.bank_transactions (company_id, bank_account_id, txn_date, description, normalized_counterparty, reference, direction, amount, status, match_type, matched_entity_id, matched_label, confidence, reconciled, import_batch)
  select co, ba_op, sp.payment_date, 'OUTWARD TT '||upper(s.name), s.name, sp.reference, 'out', sp.amount,
    'matched', 'bill', sp.supplier_bill_id, b.number, 96 + (abs(hashtext(sp.number)) % 4), true, 'STMT-2026-08'
  from public.supplier_payments sp
  join public.suppliers s on s.id = sp.supplier_id
  left join public.supplier_bills b on b.id = sp.supplier_bill_id
  where sp.company_id = co;

  insert into public.bank_transactions (company_id, bank_account_id, txn_date, description, normalized_counterparty, reference, direction, amount, status, match_type, matched_entity_id, matched_label, confidence, reconciled, import_batch)
  select co, ba_op, e.expense_date, 'POS/DEBIT '||upper(e.merchant), e.merchant, e.number, 'out', e.amount + e.vat,
    case when e.number = 'EXP-90144' then 'review' else 'matched' end, 'expense', e.id, e.number,
    case when e.number = 'EXP-90144' then 74 else 95 + (abs(hashtext(e.number)) % 5) end,
    e.number <> 'EXP-90144', 'STMT-2026-08'
  from public.expenses e where e.company_id = co;

  for i in 0..7 loop
    insert into public.bank_transactions (company_id, bank_account_id, txn_date, description, normalized_counterparty, reference, direction, amount, status, match_type, matched_label, confidence, reconciled, import_batch)
    values
      (co, ba_pay, (date '2026-01-28' + (i||' month')::interval)::date, 'WPS SALARY TRANSFER BATCH '||(i+1), 'WPS Payroll', 'WPS-'||(i+1), 'out', 412000 + i * 3100, 'matched', 'transfer', 'Payroll run', 99, true, 'STMT-2026-08'),
      (co, ba_op, (date '2026-01-02' + (i||' month')::interval)::date, 'STANDING ORDER — AL QUOZ WAREHOUSE RENT', 'Dubai Industrial Properties', 'SO-RENT', 'out', 96000, 'matched', 'expense', 'Warehouse rent', 99, true, 'STMT-2026-08'),
      (co, ba_op, (date '2026-01-15' + (i||' month')::interval)::date, 'DEWA UTILITY DEBIT', 'DEWA', 'DEWA-'||(i+1), 'out', 21400 + i * 640, 'matched', 'expense', 'Utilities', 98, true, 'STMT-2026-08'),
      (co, ba_op, (date '2026-01-20' + (i||' month')::interval)::date, 'BANK CHARGES — TRADE FINANCE', 'Emirates NBD', 'CHG-'||(i+1), 'out', 1450 + i * 30, 'matched', 'expense', 'Finance costs', 97, true, 'STMT-2026-08');
  end loop;

  for i in 1..190 loop
    d := date '2026-01-04' + ((i - 1) * 11 / 10);
    amt := 320 + ((i * 1873) % 24000);
    insert into public.bank_transactions (company_id, bank_account_id, txn_date, description, normalized_counterparty, reference, direction, amount, status, match_type, matched_label, confidence, reconciled, import_batch)
    values (co,
      case when i % 3 = 0 then ba_col else ba_op end, d,
      (array['CARD SETTLEMENT NETWORK INTERNATIONAL','INWARD TT MISC CUSTOMER','FUEL CARD SETTLEMENT ADNOC','FREIGHT CHARGES MERIDIAN FF','CUSTOMS DUTY DUBAI TRADE','INSURANCE PREMIUM ORIENT','MAINTENANCE CONTRACT SKYLINE','SOFTWARE SUBSCRIPTION HORIZON IT'])[1 + (i % 8)],
      (array['Network International','Misc Customer','ADNOC','Meridian Freight Forwarding','Dubai Trade','Orient Insurance','Skyline Facility Maintenance','Horizon IT Systems'])[1 + (i % 8)],
      'TRX'||(500000 + i * 7),
      case when i % 4 = 1 then 'in' else 'out' end, amt,
      case when i % 17 = 0 then 'unmatched' when i % 9 = 0 then 'suggested' else 'matched' end,
      case when i % 4 = 1 then 'invoice' else 'expense' end,
      case when i % 17 = 0 then null when i % 9 = 0 then 'Possible match — '||(array['INV-10488','BILL-70122','EXP-90107','INV-10511'])[1 + (i % 4)] else 'Auto-matched' end,
      case when i % 17 = 0 then null when i % 9 = 0 then 62 + (i % 30) else 96 + (i % 4) end,
      (i % 17 <> 0 and i % 9 <> 0), 'STMT-2026-08');
  end loop;

  insert into public.bank_transactions (company_id, bank_account_id, txn_date, description, normalized_counterparty, reference, direction, amount, status, confidence, reconciled, import_batch)
  values (co, ba_col, today - 3, 'INWARD TT REF 88213 — NO REMITTANCE ADVICE', null, 'TT88213', 'in', 3250, 'unmatched', null, false, 'STMT-2026-08');

  update public.bank_accounts ba set
    current_balance = coalesce((select sum(case when direction='in' then amount else -amount end) from public.bank_transactions t where t.bank_account_id = ba.id), 0) + 1850000,
    ledger_balance = coalesce((select sum(case when direction='in' then amount else -amount end) from public.bank_transactions t where t.bank_account_id = ba.id and t.reconciled), 0) + 1850000
  where ba.company_id = co;

  insert into public.bank_reconciliations (company_id, bank_account_id, period_label, statement_balance, ledger_balance, difference, matched_count, unmatched_count, status)
  select co, ba.id, 'August 2026', ba.current_balance, ba.ledger_balance, round(ba.current_balance - ba.ledger_balance, 2),
    (select count(*) from public.bank_transactions t where t.bank_account_id = ba.id and t.status = 'matched'),
    (select count(*) from public.bank_transactions t where t.bank_account_id = ba.id and t.status <> 'matched'),
    case when ba.current_balance = ba.ledger_balance then 'reconciled' else 'in_progress' end
  from public.bank_accounts ba where ba.company_id = co;

  for i in 1..6 loop
    v_prod := fgs[i];
    insert into public.boms (company_id, product_id, name, output_quantity, labour_cost, overhead_cost)
    select co, v_prod, 'BOM — '||name, 1, round(cost * 0.18, 2), round(cost * 0.09, 2)
    from public.products where id = v_prod returning id into v_bom;
    for j in 1..3 loop
      insert into public.bom_items (bom_id, product_id, quantity_per_unit)
      values (v_bom, rms[1 + ((i * 3 + j) % array_length(rms,1))], round((2 + ((i + j) % 7))::numeric, 2));
    end loop;
  end loop;

  for i in 1..12 loop
    select b.id, b.product_id into v_bom, v_prod from public.boms b where b.company_id = co offset (i % 6) limit 1;
    qty := 20 + (i * 7) % 60;
    select round(cost * qty * 0.72, 2) into exp_cost from public.products where id = v_prod;
    act_cost := round(exp_cost * (0.97 + ((i * 13) % 14) / 100.0), 2);
    if i = 5 then exp_cost := 18400; act_cost := 20150; end if;

    insert into public.production_orders (company_id, number, product_id, bom_id, quantity, start_date, end_date,
      expected_material_cost, actual_material_cost, expected_total_cost, actual_total_cost, variance, variance_pct, status)
    values (co, 'PRO-'||(40100 + i), v_prod, v_bom, qty, today - (140 - i * 11),
      case when i <= 9 then today - (132 - i * 11) else null end,
      exp_cost, act_cost, round(exp_cost * 1.27, 2), round(act_cost * 1.27, 2),
      round(act_cost - exp_cost, 2), round(((act_cost - exp_cost) / nullif(exp_cost,0)) * 100, 3),
      case when i <= 9 then 'completed' else 'in_progress' end)
    returning id into v_po2;

    insert into public.production_materials (production_order_id, product_id, expected_quantity, actual_quantity, unit_cost, value)
    select v_po2, bi.product_id, round(bi.quantity_per_unit * qty, 3),
      round(bi.quantity_per_unit * qty * (1 + ((i % 9) / 100.0)), 3), p.cost,
      round(bi.quantity_per_unit * qty * p.cost, 2)
    from public.bom_items bi join public.products p on p.id = bi.product_id where bi.bom_id = v_bom;

    if i <= 9 then
      insert into public.production_outputs (production_order_id, product_id, quantity, unit_cost, value, output_date)
      values (v_po2, v_prod, qty, round(act_cost / qty, 4), round(act_cost, 2), today - (132 - i * 11));

      insert into public.inventory_transactions (company_id, product_id, warehouse_id, txn_date, kind, quantity, unit_cost, value, ref_type, ref_id)
      values (co, v_prod, wh_fg, today - (132 - i * 11), 'production_output', qty, round(act_cost / qty, 4), round(act_cost, 2), 'production_order', v_po2);

      insert into public.inventory_transactions (company_id, product_id, warehouse_id, txn_date, kind, quantity, unit_cost, value, ref_type, ref_id)
      select co, pm.product_id, wh_rm, today - (140 - i * 11), 'production_consumption', -pm.actual_quantity, pm.unit_cost,
        round(pm.actual_quantity * pm.unit_cost, 2), 'production_order', v_po2
      from public.production_materials pm where pm.production_order_id = v_po2;

      perform public.post_journal(co, today - (132 - i * 11), 'Production order PRO-'||(40100 + i)||' completed',
        'production_order', v_po2, 'PRO-'||(40100 + i),
        jsonb_build_array(
          jsonb_build_object('code','1230','desc','Finished goods received','debit', round(act_cost,2),'credit',0),
          jsonb_build_object('code','1210','desc','Raw materials consumed','debit',0,'credit', round(act_cost * 0.78, 2)),
          jsonb_build_object('code','5200','desc','Production overhead applied','debit',0,'credit', round(act_cost * 0.22, 2))));
    end if;
  end loop;

  insert into public.budgets (company_id, period, account_code, label, amount)
  select co, to_char(date '2026-01-01' + (n||' month')::interval, 'YYYY-MM'), b.code, b.label,
    round(b.base * (1 + n * 0.015), 2)
  from generate_series(0,11) n
  cross join (values ('4000','Revenue',1150000),('5000','Cost of goods sold',745000),
    ('6000','Salaries & wages',412000),('6100','Rent',96000),('6200','Utilities',22000),
    ('6300','Transport & logistics',38000),('6500','Other operating expenses',54000)) as b(code,label,base);

  insert into public.forecasts (company_id, period, metric, amount, basis)
  select co, to_char(date '2026-08-01' + (n||' month')::interval, 'YYYY-MM'), m.metric,
    round(m.base * (1 + n * m.growth), 2), 'trend'
  from generate_series(0,4) n
  cross join (values ('revenue',1218000,0.021),('gross_profit',402000,0.018),('opex',624000,0.008),('ebitda',178000,0.026)) as m(metric,base,growth);

  insert into public.cash_forecasts (company_id, forecast_date, opening_balance, inflow, outflow, closing_balance)
  select co, today + n, 0, round(48000 + ((n * 9973) % 145000), 2), round(52000 + ((n * 7717) % 158000), 2), 0
  from generate_series(0, 89) n;

  with running as (
    select id, forecast_date,
      2384000 + sum(inflow - outflow) over (order by forecast_date rows between unbounded preceding and current row) as closing
    from public.cash_forecasts where company_id = co
  )
  update public.cash_forecasts cf set closing_balance = round(r.closing, 2), opening_balance = round(r.closing - cf.inflow + cf.outflow, 2)
  from running r where r.id = cf.id;

  insert into public.documents (company_id, name, category, size_kb, uploaded_by, extracted, extraction_status, created_at)
  select co, i.number||' — Tax Invoice.pdf', 'sales', 180 + (abs(hashtext(i.number)) % 400), 'System',
    jsonb_build_object('total', i.total, 'vat', i.vat, 'trn', '100234567800003', 'date', i.invoice_date), 'extracted', i.created_at
  from public.invoices i where i.company_id = co;

  insert into public.document_links (document_id, entity_type, entity_id, label)
  select dd.id, 'invoice', i.id, i.number
  from public.documents dd join public.invoices i on dd.name = i.number||' — Tax Invoice.pdf' where dd.company_id = co;

  insert into public.documents (company_id, name, category, size_kb, uploaded_by, extracted, extraction_status)
  select co, b.number||' — Supplier Invoice.pdf', 'purchases', 210 + (abs(hashtext(b.number)) % 380), 'Fatima Al Suwaidi',
    jsonb_build_object('supplier_ref', b.supplier_ref, 'total', b.total, 'vat', b.vat), 'extracted'
  from public.supplier_bills b where b.company_id = co;

  insert into public.document_links (document_id, entity_type, entity_id, label)
  select dd.id, 'supplier_bill', b.id, b.number
  from public.documents dd join public.supplier_bills b on dd.name = b.number||' — Supplier Invoice.pdf' where dd.company_id = co;

  insert into public.documents (company_id, name, category, size_kb, uploaded_by, extraction_status) values
  (co, 'Emirates NBD Statement — August 2026.csv', 'banking', 640, 'Ahmed Rahman', 'extracted'),
  (co, 'FTA VAT Return Q2 2026.pdf', 'tax', 320, 'Ahmed Rahman', 'extracted'),
  (co, 'Trade Licence 2026.pdf', 'contracts', 1240, 'Ahmed Rahman', 'extracted'),
  (co, 'Al Quoz Warehouse Lease Agreement.pdf', 'contracts', 2180, 'Ahmed Rahman', 'extracted'),
  (co, 'Production Cost Sheet — August 2026.xlsx', 'production', 410, 'Rajesh Menon', 'extracted');

  insert into public.exceptions (company_id, code, type, title, priority, source, entity_type, entity_id, entity_label,
    amount, description, reason, recommendation, confidence, history_note, actions, accounting_impact, status, assigned_to, due_date)
  select co, 'EXC-1001', 'payment_difference', 'Payment difference on INV-10492', 'high', 'Bank reconciliation',
    'invoice', i.id, i.number, 150,
    'Invoice AED 25,000.00 — payment received AED 24,850.00. Difference AED 150.00 (0.6%) exceeds the AED 50 tolerance.',
    'Received amount is short of the invoiced total and the shortfall is above the configured absolute tolerance.',
    'Likely customer discount. ABC Trading LLC has made 7 similar deductions in the last 6 months, averaging 0.8% of invoice value.',
    96, 'ABC Trading LLC — 7 prior payment differences, average 0.8%, typically resolved as customer discount.',
    '["record_discount","keep_outstanding","write_off","credit_note","investigate"]'::jsonb,
    '[{"code":"4050","name":"Sales Discounts","debit":150,"credit":0},{"code":"1100","name":"Accounts Receivable","debit":0,"credit":150}]'::jsonb,
    'open', 'Ahmed Rahman', today + 2
  from public.invoices i where i.company_id = co and i.number = 'INV-10492';

  insert into public.exceptions (company_id, code, type, title, priority, source, entity_type, entity_id, entity_label,
    amount, description, reason, recommendation, confidence, history_note, actions, accounting_impact, status, assigned_to, due_date)
  select co, 'EXC-1002', 'supplier_overpayment', 'Supplier overpayment on BILL-70199', 'medium', 'Accounts payable',
    'supplier_bill', b.id, b.number, 420,
    'Supplier invoice AED 18,000.00 — payment released AED 18,420.00. Overpaid by AED 420.00.',
    'The payment run used the original quotation value rather than the final approved invoice.',
    'Recognise a recoverable supplier balance and offset it against the next bill from this supplier.',
    93, 'Continental Coatings LLC — 2 prior overpayments in FY2026, both offset against subsequent bills.',
    '["supplier_credit","keep_outstanding","investigate"]'::jsonb,
    '[{"code":"1300","name":"Prepayments","debit":420,"credit":0},{"code":"2000","name":"Accounts Payable","debit":0,"credit":420}]'::jsonb,
    'open', 'Fatima Al Suwaidi', today + 5
  from public.supplier_bills b where b.company_id = co and b.number = 'BILL-70199';

  insert into public.exceptions (company_id, code, type, title, priority, source, entity_type, entity_id, entity_label,
    amount, description, reason, recommendation, confidence, history_note, actions, accounting_impact, status, assigned_to, due_date)
  select co, 'EXC-1003', 'unidentified_receipt', 'Unidentified bank credit AED 3,250', 'high', 'Bank reconciliation',
    'bank_transaction', t.id, 'TT88213', 3250,
    'Inward transfer of AED 3,250.00 received with no remittance advice and no matching open invoice.',
    'No customer name, invoice reference or amount match was found within the 90-day matching window.',
    'Hold in suspense and request remittance advice. Closest candidates share neither amount nor reference.',
    41, 'Two similar unidentified credits in FY2026 were later confirmed as advance payments from new customers.',
    '["investigate","keep_outstanding","dismiss"]'::jsonb,
    '[{"code":"1000","name":"Cash & Bank","debit":3250,"credit":0},{"code":"2200","name":"Suspense / Accrued","debit":0,"credit":3250}]'::jsonb,
    'open', null, today + 1
  from public.bank_transactions t where t.company_id = co and t.reference = 'TT88213';

  insert into public.exceptions (company_id, code, type, title, priority, source, entity_type, entity_id, entity_label,
    amount, description, reason, recommendation, confidence, history_note, actions, accounting_impact, status, assigned_to, due_date)
  select co, 'EXC-1004', 'three_way_mismatch', 'Supplier invoice above PO on '||b.number, 'critical', 'Purchases',
    'supplier_bill', b.id, b.number, 750,
    'Purchase order AED 42,500.00, goods received AED 42,500.00, supplier invoice AED 43,250.00. Difference AED 750.00.',
    'Quantities match the goods receipt but the unit price on the supplier invoice is 1.8% above the agreed PO price.',
    'Review the supplier price difference before posting. Request a credit note or a signed price revision.',
    88, 'This supplier revised prices twice in FY2026; both times a credit note was issued after challenge.',
    '["investigate","supplier_credit","dismiss"]'::jsonb,
    '[{"code":"1210","name":"Raw Materials","debit":750,"credit":0},{"code":"2000","name":"Accounts Payable","debit":0,"credit":750}]'::jsonb,
    'open', 'Fatima Al Suwaidi', today
  from public.supplier_bills b where b.company_id = co and b.number = 'BILL-70117';

  insert into public.exceptions (company_id, code, type, title, priority, source, entity_type, entity_id, entity_label,
    amount, description, reason, recommendation, confidence, history_note, actions, accounting_impact, status, assigned_to, due_date)
  select co, 'EXC-1005', 'missing_document', 'Missing VAT document for EXP-90144', 'medium', 'Expenses',
    'expense', e.id, e.number, 1280,
    'Expense of AED 1,280.00 at Gulf Tools Trading has no supporting tax invoice. Input VAT of AED 64.00 is at risk.',
    'Company policy requires a tax invoice for every expense above AED 100.',
    'Request the tax invoice from the employee. If unavailable before the VAT return, reverse the input VAT claim.',
    99, 'Rajesh Menon has 3 outstanding receipt requests in FY2026.',
    '["investigate","write_off","dismiss"]'::jsonb,
    '[{"code":"1400","name":"VAT Input","debit":0,"credit":64},{"code":"6500","name":"Other Operating Expenses","debit":64,"credit":0}]'::jsonb,
    'open', 'Rajesh Menon', today + 3
  from public.expenses e where e.company_id = co and e.number = 'EXP-90144';

  insert into public.exceptions (company_id, code, type, title, priority, source, entity_type, entity_id, entity_label,
    amount, description, reason, recommendation, confidence, history_note, actions, accounting_impact, status, assigned_to, due_date)
  select co, 'EXC-1006', 'inventory_variance', 'Stock count variance — '||p.name, 'medium', 'Inventory',
    'product', p.id, p.sku, round(24 * p.cost, 2),
    'System quantity 1,200 units, physical count 1,176 units. Shortfall of 24 units valued at AED '||to_char(round(24 * p.cost,2),'FM999G999G990D00')||'.',
    'Physical count on 15 Aug 2026 is below the perpetual balance; no adjustment has been posted.',
    'Post an inventory write-down to material cost and review issue documentation for Line 3.',
    91, 'Line 3 has recorded negative count variances in 3 of the last 5 counts.',
    '["adjust_inventory","investigate","dismiss"]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('code','5100','name','Material Cost','debit', round(24 * p.cost,2), 'credit', 0),
      jsonb_build_object('code','1230','name','Finished Goods','debit', 0, 'credit', round(24 * p.cost,2))),
    'open', 'Rajesh Menon', today + 4
  from public.products p where p.company_id = co and p.sku = 'FG-5001';

  insert into public.exceptions (company_id, code, type, title, priority, source, entity_type, entity_id, entity_label,
    amount, description, reason, recommendation, confidence, history_note, actions, accounting_impact, status, assigned_to, due_date)
  select co, 'EXC-1007', 'production_variance', 'Production cost variance on '||po.number, 'high', 'Production',
    'production_order', po.id, po.number, 1750,
    'Expected production cost AED 18,400.00, actual AED 20,150.00. Actual material consumption is 9.5% above expected.',
    'Material issues exceeded the bill of material by more than the 5% tolerance for this order.',
    'Absorb the variance into production cost and review the BOM — the last three runs of this product all overran.',
    87, 'This product overran on 3 of the last 4 production orders, average overrun 7.9%.',
    '["accept_variance","investigate","dismiss"]'::jsonb,
    '[{"code":"5200","name":"Production Cost","debit":1750,"credit":0},{"code":"1220","name":"Work in Progress","debit":0,"credit":1750}]'::jsonb,
    'open', 'Rajesh Menon', today + 6
  from public.production_orders po where po.company_id = co and po.number = 'PRO-40105';

  insert into public.exceptions (company_id, code, type, title, priority, source, entity_type, entity_id, entity_label,
    amount, description, reason, recommendation, confidence, history_note, actions, accounting_impact, status, assigned_to, due_date)
  select co, 'EXC-1008', 'overdue_receivable', 'Overdue receivable — '||c.name, 'critical', 'Accounts receivable',
    'customer', c.id, c.name, 85000,
    'AED 85,000.00 is more than 60 days past due across open invoices for this customer.',
    'No payment has been received since the last statement and the balance is 34% of the credit limit.',
    'Place the account on credit hold and escalate to the commercial team before releasing new orders.',
    94, 'This customer paid 12 days late on average across the last 8 invoices.',
    '["investigate","keep_outstanding","write_off"]'::jsonb, '[]'::jsonb,
    'open', 'Ahmed Rahman', today
  from public.customers c where c.company_id = co and c.name = 'Al Marwan Contracting';

  insert into public.exceptions (company_id, code, type, title, priority, source, entity_type, entity_label,
    amount, description, reason, recommendation, confidence, actions, status, assigned_to, due_date)
  values
  (co, 'EXC-1009', 'duplicate_invoice', 'Possible duplicate supplier invoice', 'high', 'Purchases', 'supplier_bill', 'SI/2026221',
   14320, 'Two supplier invoices with the same reference and amount were received 4 days apart from Gulf Polymer Trading.',
   'Identical supplier reference, amount and VAT across two documents.',
   'Hold the second document and confirm with the supplier before posting to payables.', 92,
   '["investigate","dismiss"]'::jsonb, 'open', 'Fatima Al Suwaidi', today + 1),
  (co, 'EXC-1010', 'unusual_journal', 'Unusual manual journal above threshold', 'medium', 'Accounting', 'journal_entry', 'JE-00418',
   62500, 'A manual journal of AED 62,500.00 was posted to Other Operating Expenses outside the normal range for this account.',
   'The amount is 4.2 standard deviations above the 6-month average for manual journals on this account.',
   'Review the supporting documentation and confirm approval before period close.', 78,
   '["investigate","dismiss"]'::jsonb, 'in_review', 'Ahmed Rahman', today + 7),
  (co, 'EXC-1011', 'vat_mismatch', 'VAT output mismatch for Q2 2026', 'medium', 'Tax', 'vat_return', 'Q2 2026',
   2140, 'VAT output per the ledger differs from the sum of invoice VAT by AED 2,140.00 for the quarter.',
   'Three credit notes were posted after the return was prepared.',
   'Re-run the VAT computation and file a voluntary disclosure if the difference persists.', 84,
   '["investigate","dismiss"]'::jsonb, 'waiting', 'Ahmed Rahman', today + 9),
  (co, 'EXC-1012', 'negative_inventory', 'Negative stock on RM-3001', 'high', 'Inventory', 'product', 'RM-3001',
   0, 'Stainless Fasteners M8 Set shows a negative on-hand quantity after production consumption was posted ahead of the goods receipt.',
   'Consumption posted before the corresponding purchase receipt was entered.',
   'Post the outstanding goods receipt for PO-50123 to restore the balance.', 96,
   '["investigate","adjust_inventory"]'::jsonb, 'open', 'Rajesh Menon', today + 2);

  insert into public.exceptions (company_id, code, type, title, priority, source, entity_type, entity_label, amount,
    description, reason, recommendation, confidence, actions, status, assigned_to, resolved_at, resolution)
  values
  (co, 'EXC-0991', 'payment_difference', 'Payment difference on INV-10388', 'medium', 'Bank reconciliation', 'invoice', 'INV-10388',
   210, 'Invoice AED 34,120.00 — received AED 33,910.00.', 'Short payment above tolerance.',
   'Customer discount, consistent with prior behaviour.', 95, '["record_discount"]'::jsonb, 'resolved', 'Ahmed Rahman',
   now() - interval '3 days', 'Customer discount recorded — AED 210.00'),
  (co, 'EXC-0992', 'unidentified_receipt', 'Unidentified bank credit AED 7,400', 'low', 'Bank reconciliation', 'bank_transaction', 'TT81190',
   7400, 'Inward transfer with no remittance advice.', 'No match found.', 'Matched manually to advance payment.', 55,
   '["investigate"]'::jsonb, 'resolved', 'Fatima Al Suwaidi', now() - interval '6 days', 'Matched to customer advance'),
  (co, 'EXC-0993', 'missing_document', 'Missing receipt for EXP-90072', 'low', 'Expenses', 'expense', 'EXP-90072',
   640, 'Expense without supporting document.', 'Policy requires a tax invoice.', 'Receipt supplied by employee.', 99,
   '["investigate"]'::jsonb, 'resolved', 'Rajesh Menon', now() - interval '9 days', 'Receipt uploaded and linked');

  insert into public.insights (company_id, title, what_changed, why, impact, suggested_action, severity, confidence) values
  (co, 'Gross margin declined 2.8% this month', 'Gross margin fell from 34.1% to 31.3% in August.',
   'Raw steel purchase prices rose 6.2% while selling prices were held on three framework contracts.',
   'AED 118,000 of annualised gross profit at risk if pricing is unchanged.',
   'Review pricing on the three framework contracts renewing in Q4.', 'warning', 93),
  (co, 'Inventory grew 14% while sales grew 4%', 'Stock value increased AED 412,000 against a 4% revenue increase.',
   'Raw material purchasing continued at Q2 run-rate while finished goods dispatches slowed.',
   'Roughly AED 340,000 of working capital is tied up above the normal ratio.',
   'Pause replenishment on the five slowest-moving raw materials for one cycle.', 'warning', 89),
  (co, 'ABC Trading LLC holds 31% of open receivables', 'Concentration rose from 19% to 31% over the quarter.',
   'Three large invoices issued in July remain within terms but unpaid.',
   'A single late payer would move the cash position by more than AED 400,000.',
   'Request a payment plan and review the credit limit before the next order.', 'warning', 97),
  (co, 'Cash is expected to fall below AED 1M within 24 days', 'Projected closing balance breaches the AED 1M floor on 12 September.',
   'Two large supplier settlements and payroll fall in the same week as a slow collection cycle.',
   'Short-term funding of about AED 350,000 may be required for nine days.',
   'Accelerate collection on the four largest overdue invoices or shift one supplier payment by a week.', 'critical', 91),
  (co, 'Product FG-4001 gross margin fell from 31% to 24%', 'Margin on the AHU casing line dropped 7 points.',
   'Actual material consumption exceeded the BOM on the last three production runs.',
   'AED 62,000 of margin lost year to date on this product line.',
   'Re-cost the BOM and investigate scrap rates on Line 3.', 'warning', 86),
  (co, 'Automation handled 94% of finance work this month', '1,182 of 1,243 bank lines matched without human input.',
   'Reference-based matching and payment-term learning covered the recurring counterparties.',
   'Roughly 46 hours of manual reconciliation avoided.',
   'No action needed — review the 43 items in the review queue.', 'positive', 99);

  insert into public.audit_logs (company_id, actor, action, entity_type, entity_label, before, after, source, created_at) values
  (co, 'Ahmed Rahman', 'Resolved payment difference', 'invoice', 'INV-10388',
   '{"status":"open","balance":210}', '{"status":"resolved","resolution":"Customer Discount","amount":210}', 'exception_engine', now() - interval '3 days'),
  (co, 'Fatima Al Suwaidi', 'Approved supplier bill', 'supplier_bill', 'BILL-70142',
   '{"status":"draft"}', '{"status":"posted"}', 'app', now() - interval '4 days'),
  (co, 'System', 'Imported bank statement', 'bank_account', 'Emirates NBD •••• 4471',
   null, '{"imported":1243,"matched":1182,"review":43,"unmatched":18}', 'bank_import', now() - interval '1 day'),
  (co, 'Ahmed Rahman', 'Updated payment tolerance', 'settings', 'payment_tolerance_absolute',
   '{"amount":25}', '{"amount":50}', 'app', now() - interval '11 days'),
  (co, 'Rajesh Menon', 'Completed production order', 'production_order', 'PRO-40109',
   '{"status":"in_progress"}', '{"status":"completed"}', 'app', now() - interval '2 days');

  insert into public.activity_feed (company_id, kind, title, detail, amount, actor, created_at) values
  (co, 'bank_import', 'Bank statement imported — Emirates NBD', '1,243 transactions · 1,182 auto-matched · 43 review · 18 unmatched', null, 'System', now() - interval '1 day'),
  (co, 'exception_resolved', 'Payment difference resolved on INV-10388', 'Customer discount recorded — AED 210.00', 210, 'Ahmed Rahman', now() - interval '3 days'),
  (co, 'production_completed', 'Production order PRO-40109 completed', '48 units of Fan Coil Housing Type B moved to finished goods', null, 'Rajesh Menon', now() - interval '2 days'),
  (co, 'bill_approved', 'Supplier bill BILL-70142 approved', 'Three-way matched against PO-50142 and GRN-60142', null, 'Fatima Al Suwaidi', now() - interval '4 days');
end
$seed$;