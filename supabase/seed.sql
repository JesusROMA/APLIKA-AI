-- ============================================================================
-- Aplika.ai — seed demo (coherente con el frontend Claude Design)
-- Tenant principal: "Refaccionaria del Norte" (Plan Pro).
-- Crea usuarios de auth, organización, catálogo, inventario, clientes, pedidos,
-- pagos, facturas, IA, leads e incidencias. Usuarios super-admin y tenant.
-- Password de TODOS los usuarios demo: Aplika2026!
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PLANES
-- ---------------------------------------------------------------------------
insert into plans (id, key, name, price_mxn, price_annual_mxn, period, max_products, max_orders_month, max_users, highlight, sort) values
  ('a0000000-0000-0000-0000-000000000001','basico','Básico',990,790,'/mes',500,1000,3,false,1),
  ('a0000000-0000-0000-0000-000000000002','pro','Pro',2490,1990,'/mes',5000,10000,10,true,2),
  ('a0000000-0000-0000-0000-000000000003','enterprise','Enterprise',null,null,'',null,null,null,false,3)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- USUARIOS (auth.users) — el trigger crea profiles automáticamente
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000','d0000000-0000-0000-0000-0000000000aa','authenticated','authenticated',
   'admin@aplika.ai', crypt('Aplika2026!', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Aplika.ai","role":"super_admin"}'),
  ('00000000-0000-0000-0000-000000000000','d0000000-0000-0000-0000-0000000000b1','authenticated','authenticated',
   'juan@refanorte.mx', crypt('Aplika2026!', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Juan Méndez","role":"tenant_admin"}'),
  ('00000000-0000-0000-0000-000000000000','d0000000-0000-0000-0000-0000000000b2','authenticated','authenticated',
   'carla@refanorte.mx', crypt('Aplika2026!', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Carla Ruiz","role":"tenant_user"}')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- ORGANIZATIONS (varias para la vista super-admin)
-- ---------------------------------------------------------------------------
insert into organizations (id, slug, name, rfc, phone, status, plan_id, created_at) values
  ('11111111-1111-1111-1111-111111111111','refanorte','Refaccionaria del Norte','RNO180412QX3','81 1234 5678','activo','a0000000-0000-0000-0000-000000000002','2026-01-12'),
  ('11111111-1111-1111-1111-111111111112','salinas','Autopartes Salinas',null,null,'activo','a0000000-0000-0000-0000-000000000002','2025-11-21'),
  ('11111111-1111-1111-1111-111111111113','centro','Distribuidora Centro',null,null,'activo','a0000000-0000-0000-0000-000000000003','2025-09-08'),
  ('11111111-1111-1111-1111-111111111114','herradura','Ferretería La Herradura',null,null,'activo','a0000000-0000-0000-0000-000000000001','2026-02-03'),
  ('11111111-1111-1111-1111-111111111115','frenosgt','Balatas y Frenos GT',null,null,'prueba','a0000000-0000-0000-0000-000000000001','2026-06-19'),
  ('11111111-1111-1111-1111-111111111116','hidalgo','Mayoreo Hidalgo',null,null,'suspendido','a0000000-0000-0000-0000-000000000002','2026-03-04'),
  ('11111111-1111-1111-1111-111111111117','express','Refacciones Express',null,null,'activo','a0000000-0000-0000-0000-000000000001','2026-04-27'),
  ('11111111-1111-1111-1111-111111111118','dnorte','Distribuidora Norte',null,null,'activo','a0000000-0000-0000-0000-000000000003','2025-12-14')
on conflict (id) do nothing;

-- Suscripción del tenant principal
insert into subscriptions (organization_id, plan_id, status, started_at, current_period_end) values
  ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000002','activa','2026-01-12','2026-07-12')
on conflict do nothing;

-- Asignar organización + rol a los profiles del tenant principal
update profiles set organization_id='11111111-1111-1111-1111-111111111111', role='tenant_admin' where id='d0000000-0000-0000-0000-0000000000b1';
update profiles set organization_id='11111111-1111-1111-1111-111111111111', role='tenant_user'  where id='d0000000-0000-0000-0000-0000000000b2';
update profiles set role='super_admin', organization_id=null where id='d0000000-0000-0000-0000-0000000000aa';

-- ---------------------------------------------------------------------------
-- ALMACENES + LISTAS DE PRECIOS (tenant principal)
-- ---------------------------------------------------------------------------
insert into warehouses (id, organization_id, name, code, is_default) values
  ('22222222-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Matriz','MTZ',true),
  ('22222222-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Bodega 2','BG2',false)
on conflict (id) do nothing;

insert into price_lists (id, organization_id, name, is_default) values
  ('33333333-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Mayoreo A',true),
  ('33333333-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Mayoreo B',false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- PRODUCTOS + VARIANTES + INVENTARIO  (mismos SKUs/valores que la UI)
-- ---------------------------------------------------------------------------
do $$
declare
  org uuid := '11111111-1111-1111-1111-111111111111';
  rec record;
  pid uuid;
  vid uuid;
  wh  uuid;
begin
  for rec in
    select * from (values
      ('BAL-1184','Balata cerámica D-1184','Frenos','MTZ',6,20,120,420),
      ('FIL-FX90','Filtro de aceite FX-90','Filtros','MTZ',142,40,300,189),
      ('BUJ-NGK6','Bujía iridio NGK 6','Encendido','BG2',0,30,200,95),
      ('AMO-DEL1','Amortiguador delantero GT','Suspensión','MTZ',34,15,80,640),
      ('BAN-4PK','Banda 4PK-1230','Motor','BG2',3,15,90,230),
      ('ACE-2050','Aceite 20W-50 (caja 12)','Lubricantes','MTZ',8,25,150,980),
      ('CLU-VAL','Kit de clutch Valeo','Transmisión','MTZ',12,8,40,2480),
      ('BAL-S220','Balata semimetálica S-220','Frenos','BG2',58,20,120,380),
      ('FOC-H4','Foco halógeno H4','Eléctrico','MTZ',0,50,400,65),
      ('ANT-VW','Anticongelante VW (galón)','Lubricantes','MTZ',96,30,180,310)
    ) as t(sku,name,cat,wh,stock,mins,maxs,price)
  loop
    insert into products (organization_id, name, category) values (org, rec.name, rec.cat) returning id into pid;
    insert into product_variants (organization_id, product_id, sku, name, base_price_mxn)
      values (org, pid, rec.sku, rec.name, rec.price) returning id into vid;
    select id into wh from warehouses where organization_id=org and code=rec.wh;
    insert into inventory (organization_id, product_variant_id, warehouse_id, stock, min_stock, max_stock)
      values (org, vid, wh, rec.stock, rec.mins, rec.maxs);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- CLIENTES (CRM B2B)
-- ---------------------------------------------------------------------------
insert into customers (organization_id, name, rfc, regimen_fiscal, uso_cfdi, contact_name, phone, price_list_id, credit_limit, credit_days, discount_pct, balance) values
  ('11111111-1111-1111-1111-111111111111','Autopartes Salinas','AAS210405JK8','601 · General de Ley Personas Morales','G03 · Gastos en general','Jorge Salinas','477 123 4567','33333333-0000-0000-0000-000000000001',50000,30,5,12480),
  ('11111111-1111-1111-1111-111111111111','Ferretería La Herradura','FHE180922QP1','612 · PF con Actividades Empresariales','G03 · Gastos en general','Patricia Gómez','222 765 4321','33333333-0000-0000-0000-000000000002',20000,15,3,3950),
  ('11111111-1111-1111-1111-111111111111','Distribuidora Centro','DCE150311MN4','601 · General de Ley Personas Morales','G01 · Adquisición de mercancías','Luis Ramírez','55 8899 1020','33333333-0000-0000-0000-000000000001',80000,30,7,0),
  ('11111111-1111-1111-1111-111111111111','Mayoreo Hidalgo','MHI170605RT7','601 · General de Ley Personas Morales','G01 · Adquisición de mercancías','Ana Torres','771 456 7890','33333333-0000-0000-0000-000000000001',60000,45,6,15380),
  ('11111111-1111-1111-1111-111111111111','Refaccionaria del Bajío','RBA200714TX9','601 · General de Ley Personas Morales','G03 · Gastos en general','Mario Vega','461 234 5678','33333333-0000-0000-0000-000000000002',30000,30,4,6720),
  ('11111111-1111-1111-1111-111111111111','Distribuidora Norte','DNO140726PL6','601 · General de Ley Personas Morales','G03 · Gastos en general','Sofía Núñez','81 3344 5566','33333333-0000-0000-0000-000000000001',70000,30,6,11750)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- PEDIDOS (mismos folios/estados que la UI; se insertan con estado final ya
-- fijado para preservar el demo — el flujo real usa transition_order()).
-- ---------------------------------------------------------------------------
do $$
declare
  org uuid := '11111111-1111-1111-1111-111111111111';
  wh  uuid := '22222222-0000-0000-0000-000000000001';
  rec record;
  cust uuid;
  oid uuid;
  sub numeric;
begin
  for rec in
    select * from (values
      ('PD-1042','Autopartes Salinas','2026-06-12',8,12480,'enviado','Tienda en línea'),
      ('PD-1041','Ferretería La Herradura','2026-06-12',3,3950,'confirmado','Agente IA · WhatsApp'),
      ('PD-1040','Distribuidora Centro','2026-06-11',15,28100,'surtido','Tienda en línea'),
      ('PD-1039','Refaccionaria del Bajío','2026-06-11',5,6720,'facturado','Mostrador'),
      ('PD-1038','Balatas y Frenos GT','2026-06-10',2,1240,'borrador','Mostrador'),
      ('PD-1037','Mayoreo Hidalgo','2026-06-10',12,15380,'pagado','Agente IA · WhatsApp'),
      ('PD-1036','Autopartes del Valle','2026-06-09',6,8900,'enviado','Tienda en línea'),
      ('PD-1035','Ferretería Industrial MX','2026-06-09',20,41200,'pagado','Tienda en línea'),
      ('PD-1034','Refacciones Express','2026-06-08',1,640,'cancelada','Mostrador'),
      ('PD-1033','Distribuidora Norte','2026-06-08',9,11750,'facturado','Agente IA · WhatsApp')
    ) as t(folio,client,fecha,items,total,status,channel)
  loop
    select id into cust from customers where organization_id=org and name=rec.client limit 1;
    sub := round(rec.total / 1.16, 2);
    insert into orders (organization_id, folio, customer_id, warehouse_id, status, channel,
      subtotal, tax, total, items_count, stock_applied, created_at)
    values (org, rec.folio, cust, wh, rec.status::order_status, rec.channel,
      sub, rec.total - sub, rec.total, rec.items,
      rec.status in ('pagado','surtido','facturado','enviado'), rec.fecha)
    returning id into oid;

    -- líneas demo (3 conceptos representativos)
    insert into order_items (organization_id, order_id, sku, name, qty, unit_price, line_total) values
      (org, oid, 'BAL-1184','Balata cerámica D-1184', 24, 420, 10080),
      (org, oid, 'FIL-FX90','Filtro de aceite FX-90', 12, 189, 2268),
      (org, oid, 'BUJ-NGK6','Bujía iridio NGK 6', 8, 95, 760);
  end loop;
  -- contador de folios alineado
  insert into org_counters (organization_id, entity, value) values (org,'order',1042)
    on conflict (organization_id, entity) do update set value = 1042;
end $$;

-- ---------------------------------------------------------------------------
-- PAGOS (Stripe demo)
-- ---------------------------------------------------------------------------
do $$
declare org uuid := '11111111-1111-1111-1111-111111111111';
begin
  insert into payments (organization_id, order_id, stripe_charge_id, method, amount, status, created_at)
  select org, o.id, v.chg, v.metodo, v.amount, v.status::payment_status, v.fecha::timestamptz
  from (values
    ('PD-1042','ch_3Q8aF2','Tarjeta ···4242',12480,'exitoso','2026-06-12'),
    ('PD-1040','ch_3Q8bG7','Tarjeta ···1881',28100,'exitoso','2026-06-11'),
    ('PD-1041','ch_3Q8cH1','Transferencia SPEI',3950,'pendiente','2026-06-12'),
    ('PD-1037','ch_3Q8dJ9','Tarjeta ···0005',15380,'exitoso','2026-06-10'),
    ('PD-1034','ch_3Q8eK4','Tarjeta ···4242',640,'reembolsado','2026-06-08'),
    ('PD-1033','ch_3Q8gM8','Transferencia SPEI',11750,'exitoso','2026-06-08')
  ) as v(folio,chg,metodo,amount,status,fecha)
  join orders o on o.organization_id=org and o.folio=v.folio;
end $$;

-- ---------------------------------------------------------------------------
-- FACTURAS (CFDI 4.0 demo)
-- ---------------------------------------------------------------------------
do $$
declare org uuid := '11111111-1111-1111-1111-111111111111';
begin
  insert into invoices (organization_id, order_id, customer_id, serie, folio, uuid, regimen, uso_cfdi, subtotal, tax, total, status, timbrada_at, created_at)
  select org, o.id, o.customer_id, 'A', v.folio, v.uuid, v.regimen, v.uso,
         round(v.total/1.16,2), v.total - round(v.total/1.16,2), v.total, v.status::invoice_status,
         case when v.status='timbrada' then v.fecha::timestamptz end, v.fecha::timestamptz
  from (values
    ('1042','7A3E9C1B-4F22-4D8A-9E15-0B27C4D1F8A2','601 · General de Ley Personas Morales','G03 · Gastos en general',12480,'timbrada','2026-06-12','PD-1042'),
    ('1041',null,'612 · PF con Actividades Empresariales','G03 · Gastos en general',3950,'borrador','2026-06-12','PD-1041'),
    ('1040','C18B2E55-91A7-4C3D-B6F0-2A9E7D104B6F','601 · General de Ley Personas Morales','G03 · Gastos en general',28100,'timbrada','2026-06-11','PD-1040'),
    ('1039','E2D4A810-77BC-4F90-8C21-5B3F9A6E2C77','601 · General de Ley Personas Morales','G01 · Adquisición de mercancías',6720,'timbrada','2026-06-11','PD-1039'),
    ('1033','D5B8F02C-1E47-4A93-B2C6-8F31A9E0D746','601 · General de Ley Personas Morales','G03 · Gastos en general',11750,'timbrada','2026-06-08','PD-1033')
  ) as v(folio,uuid,regimen,uso,total,status,fecha,pedido)
  left join orders o on o.organization_id=org and o.folio=v.pedido;
  insert into org_counters (organization_id, entity, value) values (org,'invoice',1042)
    on conflict (organization_id, entity) do update set value = 1042;
end $$;

-- ---------------------------------------------------------------------------
-- AGENTE IA (conversaciones demo)
-- ---------------------------------------------------------------------------
do $$
declare org uuid := '11111111-1111-1111-1111-111111111111'; conv uuid;
begin
  insert into ai_conversations (organization_id, customer_phone, customer_name, tag, resolved, order_captured, unread, last_message_at)
  values (org,'+52 477 123 4567','Jorge Salinas','Pedido',true,true,true, now())
  returning id into conv;
  insert into ai_messages (organization_id, conversation_id, role, body) values
    (org, conv,'user','¿Tienen balatas para Versa 2019?'),
    (org, conv,'agent','¡Sí! Tenemos 3 opciones en stock. ¿Cerámicas o semimetálicas?'),
    (org, conv,'user','Cerámicas, apártamelas.'),
    (org, conv,'agent','Listo, pedido PD-1042 creado por $12,480.');
  insert into ai_conversations (organization_id, customer_phone, customer_name, tag, resolved, appointment, last_message_at) values
    (org,'+52 222 765 4321','Patricia Gómez','Cita',true,true, now() - interval '40 min'),
    (org,'+52 55 8899 1020','Luis Ramírez','Pedido',true,false, now() - interval '1 day'),
    (org,'+52 771 456 7890','Ana Torres','Info',true,false, now() - interval '1 day');
end $$;

-- ---------------------------------------------------------------------------
-- LEADS + INCIDENTES
-- ---------------------------------------------------------------------------
insert into leads (source, name, business, contact, message, industry, size) values
  ('agenda_demo','Laura Méndez','Refaccionaria del Centro','55 1234 5678','Quiero ver la demo','Refaccionaria','1,000 a 10,000'),
  ('contacto','Carlos Ruiz','Ferretería Ruiz','carlos@ruiz.mx','¿Cuánto cuesta el plan Pro?',null,null);

insert into incidents (organization_id, title, detail, severity, created_at) values
  ('11111111-1111-1111-1111-111111111116','Webhook de Stripe falló','reintentando (3/5)','error', now() - interval '8 min'),
  ('11111111-1111-1111-1111-111111111115','Timbrado CFDI rechazado','PAC · certificado del tenant','warn', now() - interval '32 min'),
  ('11111111-1111-1111-1111-111111111112','Pico de uso de API','91% del límite de plan','warn', now() - interval '1 hour'),
  ('11111111-1111-1111-1111-111111111113','Agente de IA reconectado','WhatsApp','ok', now() - interval '2 hour');
