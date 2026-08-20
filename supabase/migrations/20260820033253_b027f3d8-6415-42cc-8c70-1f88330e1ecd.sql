revoke execute on function public.has_role(uuid, public.app_role) from anon, authenticated;

insert into public.companies (id, name, legal_name, trn, country, currency, fiscal_year_start, logo_initials)
values ('a0000000-0000-4000-8000-000000000001','Al Noor Manufacturing LLC','Al Noor Manufacturing L.L.C.','100234567800003','United Arab Emirates','AED','2026-01-01','AN')
on conflict (id) do nothing;

insert into public.tax_rates (company_id, code, name, rate, kind, is_default) values
('a0000000-0000-4000-8000-000000000001','VAT5','UAE VAT 5%',0.05,'vat',true),
('a0000000-0000-4000-8000-000000000001','VAT0','Zero-rated 0%',0.00,'vat',false),
('a0000000-0000-4000-8000-000000000001','EXEMPT','Exempt',0.00,'vat',false),
('a0000000-0000-4000-8000-000000000001','RCM','Reverse charge',0.05,'vat',false);

insert into public.accounts (company_id, code, name, type, subtype, parent_code, is_group) values
('a0000000-0000-4000-8000-000000000001','1000','Cash & Bank','asset','current',null,false),
('a0000000-0000-4000-8000-000000000001','1100','Accounts Receivable','asset','current',null,false),
('a0000000-0000-4000-8000-000000000001','1200','Inventory','asset','current',null,true),
('a0000000-0000-4000-8000-000000000001','1210','Raw Materials','asset','current','1200',false),
('a0000000-0000-4000-8000-000000000001','1220','Work in Progress','asset','current','1200',false),
('a0000000-0000-4000-8000-000000000001','1230','Finished Goods','asset','current','1200',false),
('a0000000-0000-4000-8000-000000000001','1300','Prepayments','asset','current',null,false),
('a0000000-0000-4000-8000-000000000001','1400','VAT Input','asset','current',null,false),
('a0000000-0000-4000-8000-000000000001','1500','Property, Plant & Equipment','asset','non_current',null,false),
('a0000000-0000-4000-8000-000000000001','2000','Accounts Payable','liability','current',null,false),
('a0000000-0000-4000-8000-000000000001','2100','VAT Output','liability','current',null,false),
('a0000000-0000-4000-8000-000000000001','2200','Accrued Expenses','liability','current',null,false),
('a0000000-0000-4000-8000-000000000001','4000','Sales Revenue','revenue','operating',null,false),
('a0000000-0000-4000-8000-000000000001','4050','Sales Discounts','revenue','contra',null,false),
('a0000000-0000-4000-8000-000000000001','4100','Other Income','revenue','other',null,false),
('a0000000-0000-4000-8000-000000000001','5000','Cost of Goods Sold','expense','cogs',null,false),
('a0000000-0000-4000-8000-000000000001','5100','Material Cost','expense','cogs',null,false),
('a0000000-0000-4000-8000-000000000001','5200','Production Cost','expense','cogs',null,false),
('a0000000-0000-4000-8000-000000000001','5300','Purchase Discounts','expense','contra',null,false),
('a0000000-0000-4000-8000-000000000001','6000','Salaries & Wages','expense','opex',null,false),
('a0000000-0000-4000-8000-000000000001','6100','Rent','expense','opex',null,false),
('a0000000-0000-4000-8000-000000000001','6200','Utilities','expense','opex',null,false),
('a0000000-0000-4000-8000-000000000001','6300','Transport & Logistics','expense','opex',null,false),
('a0000000-0000-4000-8000-000000000001','6400','Professional Fees','expense','opex',null,false),
('a0000000-0000-4000-8000-000000000001','6500','Other Operating Expenses','expense','opex',null,false),
('a0000000-0000-4000-8000-000000000001','7000','Finance Costs','expense','finance',null,false),
('a0000000-0000-4000-8000-000000000001','8000','Share Capital','equity','equity',null,false),
('a0000000-0000-4000-8000-000000000001','8100','Retained Earnings','equity','equity',null,false)
on conflict (company_id, code) do nothing;

insert into public.accounting_periods (company_id, name, starts_on, ends_on, is_closed)
select 'a0000000-0000-4000-8000-000000000001',
       to_char(date '2026-01-01' + (n||' month')::interval,'Mon YYYY'),
       (date '2026-01-01' + (n||' month')::interval)::date,
       ((date '2026-01-01' + ((n+1)||' month')::interval) - interval '1 day')::date,
       n < 7
from generate_series(0,11) n;

insert into public.warehouses (company_id, code, name, location) values
('a0000000-0000-4000-8000-000000000001','WH-DXB','Al Quoz Main Plant','Al Quoz Industrial 3, Dubai'),
('a0000000-0000-4000-8000-000000000001','WH-JAF','Jebel Ali Finished Goods','JAFZA South, Dubai'),
('a0000000-0000-4000-8000-000000000001','WH-SHJ','Sharjah Raw Material Store','Industrial Area 12, Sharjah');

insert into public.product_categories (company_id, name, kind) values
('a0000000-0000-4000-8000-000000000001','Steel Sections','raw_material'),
('a0000000-0000-4000-8000-000000000001','Polymers & Resins','raw_material'),
('a0000000-0000-4000-8000-000000000001','Fasteners & Consumables','raw_material'),
('a0000000-0000-4000-8000-000000000001','HVAC Assemblies','finished_good'),
('a0000000-0000-4000-8000-000000000001','Storage Systems','finished_good'),
('a0000000-0000-4000-8000-000000000001','Industrial Enclosures','finished_good');

insert into public.customers (company_id, code, name, trn, email, phone, address, payment_terms_days, credit_limit, opening_balance)
select 'a0000000-0000-4000-8000-000000000001',
       'CUS-'||lpad(i::text,3,'0'), nm,
       '1002'||lpad((345000+i*137)::text,8,'0')||'3',
       lower(replace(split_part(nm,' ',1),'-',''))||'@'||lower(replace(replace(nm,' ',''),'.',''))||'.ae',
       '+971 4 '||(3000000 + i*8117)::text,
       addr, terms, lim, 0
from (values
 (1,'ABC Trading LLC','Warehouse 14, Al Quoz Industrial 2, Dubai',30,500000),
 (2,'Emirates Steel Fabricators','Musaffah M-40, Abu Dhabi',45,750000),
 (3,'Gulf Cooling Systems FZE','JAFZA North, Dubai',30,400000),
 (4,'Al Marwan Contracting','Al Khan Street, Sharjah',60,300000),
 (5,'Desert Rock Industries','ICAD 2, Abu Dhabi',30,250000),
 (6,'Nakheel Facilities Management','Al Sufouh, Dubai',45,600000),
 (7,'Bright Horizon Interiors','Business Bay, Dubai',30,180000),
 (8,'Arabian Cold Chain LLC','Ras Al Khor Industrial 1, Dubai',30,320000),
 (9,'Delta Engineering Works','Ajman Industrial 2, Ajman',30,150000),
 (10,'Sharjah Metal Works','Industrial Area 10, Sharjah',45,275000),
 (11,'Oasis Retail Group','Deira, Dubai',30,220000),
 (12,'Al Futtaim Technical Services','Festival City, Dubai',60,850000),
 (13,'Northern Emirates Logistics','Al Jazeera, Ras Al Khaimah',30,190000),
 (14,'Pinnacle Data Centres','Dubai Silicon Oasis, Dubai',45,900000),
 (15,'Zayed Port Services','Mina Zayed, Abu Dhabi',45,410000),
 (16,'Horizon Modular Buildings','Al Ain Industrial, Al Ain',30,230000),
 (17,'Coastline Marine Supplies','Umm Al Quwain Port',30,160000),
 (18,'Falcon Food Processing','Dubai Investment Park 2, Dubai',30,340000),
 (19,'Meridian Facility Solutions','Barsha Heights, Dubai',30,205000),
 (20,'Union Precision Components','Sajaa Industrial, Sharjah',45,265000)
) as t(i,nm,addr,terms,lim);

insert into public.suppliers (company_id, code, name, trn, email, phone, address, payment_terms_days, opening_balance)
select 'a0000000-0000-4000-8000-000000000001','SUP-'||lpad(i::text,3,'0'), nm,
       '1003'||lpad((225000+i*211)::text,8,'0')||'3',
       'accounts@'||lower(replace(replace(nm,' ',''),'.',''))||'.ae',
       '+971 6 '||(5000000 + i*7331)::text, addr, terms, 0
from (values
 (1,'Emirates Steel Industries','Musaffah, Abu Dhabi',45),
 (2,'Gulf Polymer Trading','Jebel Ali Free Zone, Dubai',30),
 (3,'Al Hamra Fasteners','Industrial Area 4, Sharjah',30),
 (4,'Continental Coatings LLC','Ras Al Khor, Dubai',30),
 (5,'Pacific Electricals FZC','Hamriyah Free Zone, Sharjah',45),
 (6,'Desert Gas & Welding Supplies','Al Quoz 4, Dubai',15),
 (7,'Nova Bearings Middle East','DIP 1, Dubai',30),
 (8,'Sahara Packaging Co','Ajman Industrial 1, Ajman',30),
 (9,'Meridian Freight Forwarding','Cargo Village, Dubai',15),
 (10,'Al Barsha Utilities Services','Al Barsha, Dubai',30),
 (11,'Prime Tooling Solutions','Sajaa, Sharjah',30),
 (12,'Blue Nile Chemicals','Hamriyah Free Zone, Sharjah',45),
 (13,'Skyline Facility Maintenance','Al Quoz 3, Dubai',30),
 (14,'Horizon IT Systems','Internet City, Dubai',30),
 (15,'Gulf Legal & Advisory','DIFC, Dubai',30)
) as t(i,nm,addr,terms);

insert into public.products (company_id, category_id, sku, name, kind, unit, selling_price, cost, vat_rate, reorder_level)
select 'a0000000-0000-4000-8000-000000000001',
  (select id from public.product_categories where name = cat),
  sku, nm, kind, unit, sell, cst, 0.05, reorder
from (values
 ('RM-1001','Hot Rolled Steel Coil 2mm','raw_material','Steel Sections','kg',0,4.85,5000),
 ('RM-1002','Galvanised Steel Sheet 1.2mm','raw_material','Steel Sections','kg',0,5.40,4000),
 ('RM-1003','Aluminium Extrusion Profile','raw_material','Steel Sections','m',0,22.50,1200),
 ('RM-1004','Mild Steel Angle 50x50','raw_material','Steel Sections','m',0,17.20,800),
 ('RM-1005','Stainless Steel 304 Sheet','raw_material','Steel Sections','kg',0,18.90,1500),
 ('RM-2001','Polypropylene Granules','raw_material','Polymers & Resins','kg',0,6.75,3000),
 ('RM-2002','Epoxy Resin Compound','raw_material','Polymers & Resins','kg',0,31.00,600),
 ('RM-2003','Polyurethane Insulation Foam','raw_material','Polymers & Resins','kg',0,14.30,900),
 ('RM-3001','Stainless Fasteners M8 Set','raw_material','Fasteners & Consumables','set',0,3.40,10000),
 ('RM-3002','Industrial Adhesive Cartridge','raw_material','Fasteners & Consumables','pcs',0,26.00,500),
 ('RM-3003','Powder Coating Paint','raw_material','Fasteners & Consumables','kg',0,29.50,700),
 ('RM-3004','Welding Wire 1.2mm','raw_material','Fasteners & Consumables','kg',0,12.80,1000),
 ('FG-4001','AHU Casing Unit 5000 CMH','finished_good','HVAC Assemblies','pcs',18500,11840,15),
 ('FG-4002','Fan Coil Housing Type B','finished_good','HVAC Assemblies','pcs',3250,2080,60),
 ('FG-4003','Duct Section Insulated 1m','finished_good','HVAC Assemblies','m',420,268,300),
 ('FG-4004','Air Distribution Grille','finished_good','HVAC Assemblies','pcs',185,112,500),
 ('FG-4005','Chilled Water Manifold','finished_good','HVAC Assemblies','pcs',6400,4090,25),
 ('FG-5001','Heavy Duty Pallet Rack Bay','finished_good','Storage Systems','bay',2750,1760,80),
 ('FG-5002','Mezzanine Deck Panel','finished_good','Storage Systems','pcs',960,615,120),
 ('FG-5003','Cantilever Rack Arm','finished_good','Storage Systems','pcs',340,208,400),
 ('FG-5004','Mobile Shelving Unit','finished_good','Storage Systems','pcs',1480,930,90),
 ('FG-5005','Cold Store Shelving Kit','finished_good','Storage Systems','kit',5200,3330,30),
 ('FG-6001','IP66 Control Enclosure 800mm','finished_good','Industrial Enclosures','pcs',2150,1370,70),
 ('FG-6002','Stainless Junction Box','finished_good','Industrial Enclosures','pcs',430,272,250),
 ('FG-6003','Outdoor Kiosk Enclosure','finished_good','Industrial Enclosures','pcs',7900,5060,18),
 ('FG-6004','DIN Rail Cabinet 1200mm','finished_good','Industrial Enclosures','pcs',3400,2170,45),
 ('FG-6005','Marine Grade Panel Box','finished_good','Industrial Enclosures','pcs',5600,3580,22),
 ('FG-6006','Modular Switch Room Unit','finished_good','Industrial Enclosures','pcs',24500,15680,8),
 ('FG-5006','Small Parts Bin Rack','finished_good','Storage Systems','pcs',540,342,150),
 ('FG-4006','Damper Assembly 600x600','finished_good','HVAC Assemblies','pcs',1250,795,110)
) as t(sku,nm,kind,cat,unit,sell,cst,reorder);

insert into public.inventory_balances (company_id, product_id, warehouse_id, quantity, avg_cost, value)
select p.company_id, p.id,
  (select id from public.warehouses where code = case when p.kind='raw_material' then 'WH-SHJ' else 'WH-JAF' end),
  q, p.cost, round(q * p.cost, 2)
from public.products p
cross join lateral (
  select case when p.kind='raw_material'
    then round((p.reorder_level * (1.1 + ((abs(hashtext(p.sku)) % 90)/100.0)))::numeric, 0)
    else round((p.reorder_level * (0.6 + ((abs(hashtext(p.sku)) % 130)/100.0)))::numeric, 0) end as q
) s;

insert into public.expense_categories (company_id, name, account_code) values
('a0000000-0000-4000-8000-000000000001','Salaries & Wages','6000'),
('a0000000-0000-4000-8000-000000000001','Rent','6100'),
('a0000000-0000-4000-8000-000000000001','Utilities','6200'),
('a0000000-0000-4000-8000-000000000001','Transport & Logistics','6300'),
('a0000000-0000-4000-8000-000000000001','Professional Fees','6400'),
('a0000000-0000-4000-8000-000000000001','IT & Software','6500'),
('a0000000-0000-4000-8000-000000000001','Travel & Entertainment','6500'),
('a0000000-0000-4000-8000-000000000001','Repairs & Maintenance','6500'),
('a0000000-0000-4000-8000-000000000001','Office Supplies','6500');

insert into public.bank_accounts (company_id, name, bank_name, account_number_masked, iban_masked, currency, current_balance, ledger_balance, last_synced_at, reconciliation_status) values
('a0000000-0000-4000-8000-000000000001','Operating Account','Emirates NBD','•••• 4471','AE07 0331 •••• •••• 4471','AED',0,0, now() - interval '2 hours','in_progress'),
('a0000000-0000-4000-8000-000000000001','Collections Account','Mashreq Bank','•••• 8830','AE45 0330 •••• •••• 8830','AED',0,0, now() - interval '5 hours','in_progress'),
('a0000000-0000-4000-8000-000000000001','Payroll Account','First Abu Dhabi Bank','•••• 2205','AE12 0350 •••• •••• 2205','AED',0,0, now() - interval '1 day','reconciled');

insert into public.settings (company_id, key, value, group_name, label, description) values
('a0000000-0000-4000-8000-000000000001','payment_tolerance_absolute','{"amount":50,"currency":"AED"}','tolerance','Payment difference tolerance','Differences at or below this amount can be auto-resolved.'),
('a0000000-0000-4000-8000-000000000001','payment_tolerance_percent','{"percent":0.5}','tolerance','Percentage tolerance','Differences below this share of the invoice can be auto-resolved.'),
('a0000000-0000-4000-8000-000000000001','approval_threshold','{"amount":25000}','tolerance','Management approval threshold','Write-offs above this amount require an approver.'),
('a0000000-0000-4000-8000-000000000001','auto_match_min_confidence','{"percent":95}','automation','Auto-match confidence floor','Bank matches at or above this confidence post without review.'),
('a0000000-0000-4000-8000-000000000001','require_document_for_expense','{"enabled":true,"above":100}','automation','Receipt required','Expenses above this amount must carry a document.'),
('a0000000-0000-4000-8000-000000000001','three_way_match_tolerance','{"percent":1,"amount":100}','automation','Three-way match tolerance','Allowed drift between PO, receipt and supplier invoice.'),
('a0000000-0000-4000-8000-000000000001','default_vat_rate','{"code":"VAT5","rate":0.05}','tax','Default VAT rate','Applied to new sales and purchase lines.'),
('a0000000-0000-4000-8000-000000000001','vat_return_period','{"period":"quarterly"}','tax','VAT return period','UAE FTA filing frequency.'),
('a0000000-0000-4000-8000-000000000001','costing_method','{"method":"weighted_average"}','accounting','Inventory costing','Weighted average costing for all stock movements.'),
('a0000000-0000-4000-8000-000000000001','fiscal_year','{"start":"2026-01-01","end":"2026-12-31"}','accounting','Fiscal year','Financial year currently open.'),
('a0000000-0000-4000-8000-000000000001','notify_critical_exceptions','{"email":true,"digest":"daily"}','notifications','Critical exception alerts','How the team is notified about critical items.');