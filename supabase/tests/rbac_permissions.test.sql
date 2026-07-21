-- ============================================================================
-- pgTAP — RBAC por acción (0009/0010): permisos por rol, cancelación con
-- permiso, auditoría de transiciones y gating por módulo activo.
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(7);

create extension if not exists pgtap;

-- --- Datos de prueba: 2 orgs (una SIN módulo 'ordenes'), 4 usuarios ----------
insert into organizations (id, slug, name) values
  ('a1000000-0000-0000-0000-000000000001','orgperm','Org Permisos'),
  ('a2000000-0000-0000-0000-000000000002','orgsinord','Org Sin Órdenes');

-- Módulos activos SOLO para la primera org (la segunda queda sin 'ordenes')
insert into organization_modules (organization_id, module_id, enabled)
select 'a1000000-0000-0000-0000-000000000001', id, true
  from modules where key in ('ordenes','inventario')
on conflict do nothing;

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','a1111111-0000-0000-0000-000000000001','authenticated','authenticated','admin@perm.mx'),
  ('00000000-0000-0000-0000-000000000000','a1111111-0000-0000-0000-000000000002','authenticated','authenticated','oper@perm.mx'),
  ('00000000-0000-0000-0000-000000000000','a1111111-0000-0000-0000-000000000003','authenticated','authenticated','viewer@perm.mx'),
  ('00000000-0000-0000-0000-000000000000','a1111111-0000-0000-0000-000000000004','authenticated','authenticated','admin@sinord.mx');

update profiles set organization_id='a1000000-0000-0000-0000-000000000001', role='tenant_admin'  where id='a1111111-0000-0000-0000-000000000001';
update profiles set organization_id='a1000000-0000-0000-0000-000000000001', role='tenant_user'   where id='a1111111-0000-0000-0000-000000000002';
update profiles set organization_id='a1000000-0000-0000-0000-000000000001', role='tenant_viewer' where id='a1111111-0000-0000-0000-000000000003';
update profiles set organization_id='a2000000-0000-0000-0000-000000000002', role='tenant_admin'  where id='a1111111-0000-0000-0000-000000000004';

-- Pedidos: uno cancelable en la org con módulos; otro en la org sin 'ordenes'
insert into orders (id, organization_id, folio, status) values
  ('a3000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','T-1','borrador'),
  ('a3000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','T-2','borrador');

-- --- Helper para simular usuario autenticado ---------------------------------
create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

-- ============ (1) tenant_viewer NO puede crear (INSERT customers) ============
select _login('a1111111-0000-0000-0000-000000000003');
select throws_ok(
  $$ insert into customers (organization_id, name)
     values ('a1000000-0000-0000-0000-000000000001','Cliente Pirata') $$,
  '42501', NULL,
  'tenant_viewer NO puede insertar en customers'
);

-- ============ (2) tenant_user SÍ puede crear (INSERT customers) ==============
select _login('a1111111-0000-0000-0000-000000000002');
select lives_ok(
  $$ insert into customers (organization_id, name)
     values ('a1000000-0000-0000-0000-000000000001','Cliente Operador') $$,
  'tenant_user SÍ puede insertar en customers'
);

-- ============ (3) tenant_user NO puede cancelar pedidos ======================
select _login('a1111111-0000-0000-0000-000000000002');
select throws_ok(
  $$ select transition_order('a3000000-0000-0000-0000-000000000001','cancelada') $$,
  '42501', NULL,
  'tenant_user NO puede transition_order a cancelada (42501)'
);

-- ============ (4) tenant_admin SÍ puede cancelar =============================
select _login('a1111111-0000-0000-0000-000000000001');
select lives_ok(
  $$ select transition_order('a3000000-0000-0000-0000-000000000001','cancelada') $$,
  'tenant_admin SÍ puede cancelar el pedido'
);

-- ============ (5) La transición dejó bitácora en audit_log ===================
select is(
  (select count(*)::int from audit_log
    where organization_id = 'a1000000-0000-0000-0000-000000000001'
      and entity_type = 'order'
      and entity_id = 'a3000000-0000-0000-0000-000000000001'
      and action = 'transicion'
      and detail ->> 'a' = 'cancelada'),
  1,
  'La cancelación quedó registrada en audit_log'
);

-- ============ (6) Org sin módulo ordenes ⇒ 0 filas en orders =================
select _login('a1111111-0000-0000-0000-000000000004');
select is(
  (select count(*)::int from orders),
  0,
  'Miembro de org sin módulo ordenes obtiene 0 filas al SELECT de orders'
);

-- ============ (7) tenant_viewer NO puede transicionar (guarda editar) ========
-- La guarda general de transition_order dispara antes que la lógica de pipeline,
-- así que aplica aunque el pedido ya esté cancelado.
select _login('a1111111-0000-0000-0000-000000000003');
select throws_ok(
  $$ select transition_order('a3000000-0000-0000-0000-000000000001','confirmado') $$,
  '42501', NULL,
  'tenant_viewer NO puede transition_order (falta ordenes/editar)'
);

select finish();
rollback;
