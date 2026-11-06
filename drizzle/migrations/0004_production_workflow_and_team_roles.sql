-- Team roles: readable by signed-in users, writable only through server-side admin checks
DROP POLICY IF EXISTS authenticated_all ON public.user_roles;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
CREATE POLICY user_roles_read ON public.user_roles FOR SELECT TO authenticated USING (true);
GRANT ALL ON public.profiles TO service_role;
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_company_uq ON public.user_roles(user_id, company_id);

-- Production: plan -> start -> complete (posts) / cancel
CREATE OR REPLACE FUNCTION public.create_production_order(p_bom uuid, p_qty numeric, p_start date, p_end date)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
declare b boms%rowtype; v_id uuid; v_num text; v_max int; v_mat numeric := 0; v_scale numeric; it record; v_cost numeric;
begin
  select * into b from boms where id = p_bom;
  if b.id is null then raise exception 'Choose a bill of materials'; end if;
  if coalesce(p_qty,0) <= 0 then raise exception 'Enter a quantity to produce'; end if;
  select coalesce(max(substring(number from '\d+$')::int), 40100) into v_max from production_orders where company_id = b.company_id;
  v_num := 'PRO-' || (v_max + 1)::text;
  v_scale := p_qty / nullif(b.output_quantity, 0);
  insert into production_orders(company_id, number, product_id, bom_id, quantity, start_date, end_date, status,
    expected_material_cost, actual_material_cost, expected_total_cost, actual_total_cost, variance, variance_pct)
  values (b.company_id, v_num, b.product_id, b.id, p_qty, coalesce(p_start, current_date), p_end, 'planned', 0, 0, 0, 0, 0, 0)
  returning id into v_id;
  for it in select bi.product_id, bi.quantity_per_unit, p.cost from bom_items bi join products p on p.id = bi.product_id where bi.bom_id = b.id loop
    select coalesce((select avg_cost from inventory_balances where product_id = it.product_id and avg_cost > 0 limit 1), it.cost, 0) into v_cost;
    insert into production_materials(production_order_id, product_id, expected_quantity, actual_quantity, unit_cost, value)
    values (v_id, it.product_id, round(it.quantity_per_unit * v_scale, 4), 0, v_cost, round(it.quantity_per_unit * v_scale * v_cost, 2));
    v_mat := v_mat + round(it.quantity_per_unit * v_scale * v_cost, 2);
  end loop;
  update production_orders set expected_material_cost = v_mat,
    expected_total_cost = v_mat + round((b.labour_cost + b.overhead_cost) * v_scale, 2) where id = v_id;
  insert into activity_feed(company_id, kind, title, detail, amount, actor, entity_type, entity_id)
  values (b.company_id, 'production', 'Production order ' || v_num || ' planned', b.name, v_mat, 'Ahmed Rahman', 'production_order', v_id);
  return v_id;
end $$;

CREATE OR REPLACE FUNCTION public.set_production_status(p_order uuid, p_status text)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $$
declare o production_orders%rowtype;
begin
  select * into o from production_orders where id = p_order for update;
  if o.id is null then raise exception 'Production order not found'; end if;
  if p_status = 'in_progress' and o.status <> 'planned' then raise exception 'Only planned orders can be started'; end if;
  if p_status = 'cancelled' and o.status not in ('planned','in_progress') then raise exception 'Completed orders cannot be cancelled'; end if;
  if p_status not in ('in_progress','cancelled') then raise exception 'Unsupported status'; end if;
  update production_orders set status = p_status where id = p_order;
  insert into activity_feed(company_id, kind, title, actor, entity_type, entity_id)
  values (o.company_id, 'production', o.number || case when p_status = 'cancelled' then ' cancelled' else ' started' end, 'Ahmed Rahman', 'production_order', o.id);
end $$;

-- p_actuals: [{ "id": production_material_id, "actual_quantity": n }]
CREATE OR REPLACE FUNCTION public.complete_production_order(p_order uuid, p_output numeric, p_actuals jsonb, p_date date)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
declare o production_orders%rowtype; b boms%rowtype; m record; v_qty numeric; v_cost numeric; v_val numeric;
  v_raw numeric := 0; v_fgmat numeric := 0; v_conv numeric; v_total numeric; v_unit numeric; v_lines jsonb; v_je uuid; v_date date := coalesce(p_date, current_date);
begin
  select * into o from production_orders where id = p_order for update;
  if o.id is null then raise exception 'Production order not found'; end if;
  if o.status not in ('planned','in_progress') then raise exception 'This order is already %', o.status; end if;
  if coalesce(p_output,0) <= 0 then raise exception 'Enter the quantity produced'; end if;
  select * into b from boms where id = o.bom_id;
  for m in select pm.*, p.kind, p.name from production_materials pm join products p on p.id = pm.product_id where pm.production_order_id = o.id loop
    v_qty := coalesce((select (e->>'actual_quantity')::numeric from jsonb_array_elements(coalesce(p_actuals,'[]'::jsonb)) e where (e->>'id')::uuid = m.id), m.expected_quantity);
    if v_qty < 0 then raise exception 'Quantity used for % cannot be negative', m.name; end if;
    select coalesce((select avg_cost from inventory_balances where product_id = m.product_id and avg_cost > 0 limit 1), m.unit_cost) into v_cost;
    v_val := round(v_qty * v_cost, 2);
    if v_qty > 0 then perform move_inventory(o.company_id, m.product_id, -v_qty, v_cost, 'production_consumption', 'production_order', o.id, v_date); end if;
    update production_materials set actual_quantity = v_qty, unit_cost = v_cost, value = v_val where id = m.id;
    if m.kind = 'raw_material' then v_raw := v_raw + v_val; else v_fgmat := v_fgmat + v_val; end if;
  end loop;
  v_conv := round((coalesce(b.labour_cost,0) + coalesce(b.overhead_cost,0)) * p_output / nullif(coalesce(b.output_quantity,1),0), 2);
  v_total := v_raw + v_fgmat + v_conv;
  v_unit := round(v_total / p_output, 4);
  perform move_inventory(o.company_id, o.product_id, p_output, v_unit, 'production_output', 'production_order', o.id, v_date);
  insert into production_outputs(production_order_id, product_id, quantity, unit_cost, value, output_date)
  values (o.id, o.product_id, p_output, v_unit, v_total, v_date);
  v_lines := jsonb_build_array(jsonb_build_object('code','1230','desc','Finished goods produced','debit',v_total,'credit',0));
  if v_raw > 0 then v_lines := v_lines || jsonb_build_object('code','1210','desc','Raw materials consumed','debit',0,'credit',v_raw); end if;
  if v_fgmat > 0 then v_lines := v_lines || jsonb_build_object('code','1230','desc','Components consumed','debit',0,'credit',v_fgmat); end if;
  if v_conv > 0 then v_lines := v_lines || jsonb_build_object('code','5200','desc','Labour & overhead absorbed','debit',0,'credit',v_conv); end if;
  if v_total > 0 then
    v_je := post_journal(o.company_id, v_date, 'Production completed ' || o.number, 'production_order', o.id, o.number, v_lines, 'production');
  end if;
  update production_orders set status = 'completed', end_date = v_date,
    actual_material_cost = v_raw + v_fgmat, actual_total_cost = v_total,
    variance = v_total - expected_total_cost,
    variance_pct = case when expected_total_cost > 0 then round((v_total - expected_total_cost) / expected_total_cost * 100, 2) else 0 end
  where id = o.id;
  insert into activity_feed(company_id, kind, title, detail, amount, actor, entity_type, entity_id)
  values (o.company_id, 'production', 'Production order ' || o.number || ' completed', p_output || ' units to finished goods', v_total, 'Ahmed Rahman', 'production_order', o.id);
  return v_je;
end $$;

REVOKE EXECUTE ON FUNCTION public.create_production_order(uuid, numeric, date, date) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_production_status(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.complete_production_order(uuid, numeric, jsonb, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_production_order(uuid, numeric, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_production_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_production_order(uuid, numeric, jsonb, date) TO authenticated;