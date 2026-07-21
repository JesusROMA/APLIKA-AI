-- ============================================================================
-- Aplika.ai — 0010 · FASE 0 Fundaciones (contrato C1.1–C1.7)
-- RBAC por acción (role_permissions + app.has_perm/app.org_has_module),
-- RLS por operación, impersonación real de super_admin, auditoría transversal
-- (audit_log + app.log_audit + transition_order v2), campos personalizados,
-- maestros SAT (columnas + catálogos sat_*).
-- Requiere 0009_user_role_viewer.sql (valor de enum 'tenant_viewer').
-- ============================================================================

-- ----------------------------------------------------------------------------
-- C1.1 · ROLE_PERMISSIONS (RBAC por acción)
-- organization_id NULL = default global de la plataforma; fila con org =
-- override del tenant. PG15: unique nulls not distinct para que el default
-- global no se duplique.
-- ----------------------------------------------------------------------------
create table role_permissions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),   -- NULL = default global
  role            user_role not null,
  module_key      text not null,                        -- key de modules o módulo virtual 'maestros'
  action          text not null check (action in ('ver','crear','editar','cancelar','configurar')),
  allowed         boolean not null,
  unique nulls not distinct (organization_id, role, module_key, action)
);
create index idx_roleperm_org on role_permissions(organization_id);

-- ----------------------------------------------------------------------------
-- C1.1 · Helpers RBAC (SECURITY DEFINER, schema app) + wrappers public.*
-- ----------------------------------------------------------------------------

-- ¿El usuario actual tiene permiso p_action sobre p_module?
-- Orden: service_role ⇒ true; super_admin ⇒ true; rol 'customer' o usuario
-- sin org ⇒ false; resolución: fila (org actual, rol, módulo, acción) →
-- fila default (organization_id IS NULL) → false.
create or replace function app.has_perm(p_module text, p_action text)
returns boolean
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_role    user_role;
  v_org     uuid;
  v_allowed boolean;
begin
  if auth.role() = 'service_role' then return true; end if;
  if app.is_super_admin() then return true; end if;

  v_role := app.current_role();
  v_org  := app.current_org_id();
  if v_role is null or v_role = 'customer' or v_org is null then
    return false;
  end if;

  select allowed into v_allowed
    from role_permissions
   where organization_id = v_org and role = v_role
     and module_key = p_module and action = p_action;
  if v_allowed is not null then return v_allowed; end if;

  select allowed into v_allowed
    from role_permissions
   where organization_id is null and role = v_role
     and module_key = p_module and action = p_action;
  return coalesce(v_allowed, false);
end; $$;

-- ¿La org actual tiene activo el módulo p_module?
-- Keys virtuales/core 'maestros', 'dashboard', 'config' ⇒ true si hay org.
create or replace function app.org_has_module(p_module text)
returns boolean
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_org uuid;
begin
  if auth.role() = 'service_role' then return true; end if;
  if app.is_super_admin() then return true; end if;

  v_org := app.current_org_id();
  if p_module in ('maestros','dashboard','config') then
    return v_org is not null;
  end if;

  return exists (
    select 1
      from organization_modules om
      join modules m on m.id = om.module_id
     where om.organization_id = v_org
       and om.enabled
       and m.key = p_module
  );
end; $$;

revoke all on function app.has_perm(text, text), app.org_has_module(text) from public;
grant execute on function app.has_perm(text, text), app.org_has_module(text) to authenticated, anon, service_role;

-- Wrappers públicos (PostgREST solo expone `public`; mismo patrón que 0003)
create or replace function public.has_perm(p_module text, p_action text)
returns boolean language sql stable security definer set search_path = public, app as $$
  select app.has_perm(p_module, p_action);
$$;
grant execute on function public.has_perm(text, text) to authenticated, service_role;

create or replace function public.org_has_module(p_module text)
returns boolean language sql stable security definer set search_path = public, app as $$
  select app.org_has_module(p_module);
$$;
grant execute on function public.org_has_module(text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- C1.3 · current_org_id() v2 — impersonación de super_admin cableada de verdad
-- Orden de resolución: GUC app.impersonate_org → header PostgREST
-- x-aplika-impersonate (solo super_admin) → profiles.organization_id.
-- String vacío ⇒ ignorar. is_super_admin() NO llama a current_org_id()
-- (verificado en 0002) ⇒ sin recursión.
-- ----------------------------------------------------------------------------
create or replace function app.current_org_id()
returns uuid
language plpgsql stable security definer set search_path = public, app as $$
declare
  imp text;
  hdr text;
  oid uuid;
begin
  -- 1) GUC de sesión de soporte (lo fija el servidor con service-role)
  imp := nullif(current_setting('app.impersonate_org', true), '');
  if imp is not null and app.is_super_admin() then
    return imp::uuid;
  end if;

  -- 2) Header PostgREST x-aplika-impersonate (solo super_admin).
  --    request.headers puede no existir o no ser JSON válido ⇒ ignorar.
  if app.is_super_admin() then
    begin
      hdr := nullif(current_setting('request.headers', true)::json ->> 'x-aplika-impersonate', '');
      if hdr is not null then
        return hdr::uuid;
      end if;
    exception when others then
      hdr := null; -- JSON o UUID inválido ⇒ ignorar
    end;
  end if;

  -- 3) Organización propia del perfil
  select organization_id into oid from profiles where id = auth.uid();
  return oid;
end; $$;

-- Wrapper público (PostgREST solo expone `public`; útil para depurar y para los
-- tests, ya que `authenticated` no tiene USAGE sobre el schema `app`).
create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path = public, app as $$
  select app.current_org_id();
$$;
grant execute on function public.current_org_id() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- C1.4 · AUDIT_LOG + app.log_audit (auditoría transversal)
-- ----------------------------------------------------------------------------
create table audit_log (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references organizations(id),
  actor_id        uuid references profiles(id),
  entity_type     text not null,        -- 'order','invoice','customer','module',...
  entity_id       text not null,
  action          text not null,        -- 'crear','editar','cancelar','transicion','config',...
  detail          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index idx_audit_org_created on audit_log(organization_id, created_at desc);
create index idx_audit_org_entity  on audit_log(organization_id, entity_type, entity_id);

-- Helper de escritura: resuelve org (p_org → current_org_id) y actor
-- (auth.uid(), puede ser null p.ej. service_role). Sin org ⇒ no-op.
create or replace function app.log_audit(
  p_entity_type text,
  p_entity_id   text,
  p_action      text,
  p_detail      jsonb default '{}'::jsonb,
  p_org         uuid  default null
) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  v_org uuid;
begin
  v_org := coalesce(p_org, app.current_org_id());
  if v_org is null then return; end if;
  insert into audit_log (organization_id, actor_id, entity_type, entity_id, action, detail)
  values (v_org, auth.uid(), p_entity_type, p_entity_id, p_action, coalesce(p_detail, '{}'::jsonb));
end; $$;

revoke all on function app.log_audit(text, text, text, jsonb, uuid) from public;
grant execute on function app.log_audit(text, text, text, jsonb, uuid) to service_role;

-- RLS: SELECT super_admin o tenant_admin de la org; NADIE escribe directo
-- (solo vía app.log_audit, SECURITY DEFINER).
alter table audit_log enable row level security;
create policy audit_log_select on audit_log
  for select to authenticated
  using (
    app.is_super_admin()
    or (organization_id = app.current_org_id() and app.current_role() = 'tenant_admin')
  );

-- ----------------------------------------------------------------------------
-- C1.4 · transition_order v2 — comportamiento actual EXACTO (0003) más:
-- (a) cancelar exige app.has_perm('ordenes','cancelar') ⇒ si no, 42501;
-- (b) toda transición exitosa se registra en audit_log.
-- Se pasa la org del pedido a log_audit para que también los contextos
-- service_role (webhook Stripe → 'pagado') dejen bitácora (C4: "toda
-- transición registra en audit_log").
-- ----------------------------------------------------------------------------
create or replace function public.transition_order(
  p_order_id uuid,
  p_new      order_status
) returns orders
language plpgsql security definer set search_path = public, app as $$
declare
  v_order  orders;
  v_prev   order_status;
  v_idx    int;
  v_new    int;
  pipeline order_status[] := array['borrador','confirmado','pagado','surtido','facturado','enviado']::order_status[];
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order is null then raise exception 'order not found'; end if;
  perform app.assert_org(v_order.organization_id);
  v_prev := v_order.status;

  -- Guarda general de escritura: Solo-lectura no puede transicionar en absoluto.
  -- service_role (webhook Stripe), super_admin y roles con 'editar' (Admin/
  -- Operador) pasan; tenant_viewer no. La función es SECURITY DEFINER y salta
  -- RLS, así que sin esta guarda un viewer podría avanzar pedidos vía RPC.
  if not app.has_perm('ordenes','editar') then
    raise exception 'forbidden: falta permiso ordenes/editar' using errcode = '42501';
  end if;

  if p_new = 'cancelada' then
    if not app.has_perm('ordenes','cancelar') then
      raise exception 'forbidden: falta permiso ordenes/cancelar' using errcode = '42501';
    end if;
    if v_order.status in ('facturado','enviado') then
      raise exception 'no se puede cancelar un pedido %', v_order.status;
    end if;
    update orders set status = 'cancelada', updated_at = now() where id = p_order_id returning * into v_order;
    perform app.log_audit('order', v_order.id::text, 'transicion',
      jsonb_build_object('de', v_prev, 'a', p_new), v_order.organization_id);
    return v_order;
  end if;

  if v_order.status = 'cancelada' then
    raise exception 'pedido cancelado: transición no permitida';
  end if;

  select array_position(pipeline, v_order.status) into v_idx;
  select array_position(pipeline, p_new) into v_new;
  if v_new is null then raise exception 'estado destino inválido'; end if;
  if v_new < v_idx then raise exception 'no se permite retroceder de % a %', v_order.status, p_new; end if;

  -- Aplica stock al alcanzar pagado/surtido por primera vez
  if p_new in ('pagado','surtido','facturado','enviado') then
    perform app.apply_order_stock(p_order_id);
  end if;

  update orders set status = p_new, updated_at = now() where id = p_order_id returning * into v_order;
  perform app.log_audit('order', v_order.id::text, 'transicion',
    jsonb_build_object('de', v_prev, 'a', p_new), v_order.organization_id);
  return v_order;
end; $$;

-- ----------------------------------------------------------------------------
-- C1.2 · RLS por operación (reemplaza tenant_isolation FOR ALL)
-- org-match = (app.is_super_admin() OR organization_id = app.current_org_id())
-- SELECT: org-match AND org_has_module(M) AND has_perm(M,'ver')
-- INSERT: org-match AND org_has_module(M) AND has_perm(M,'crear')
-- UPDATE: org-match AND has_perm(M,'editar')  [WITH CHECK org-match]
-- DELETE: solo super_admin (los documentos se cancelan, no se borran)
-- NO se tocan: profiles, plans, verticals, modules, organization_modules,
-- leads, incidents, whatsapp_auto_responses ni las políticas RESTRICTIVE del
-- rol customer (customers_self_restrict, orders_self_restrict).
-- ----------------------------------------------------------------------------
do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      ('customers',           'maestros'),
      ('products',            'maestros'),
      ('product_variants',    'maestros'),
      ('price_lists',         'maestros'),
      ('price_list_items',    'maestros'),
      ('warehouses',          'maestros'),
      ('orders',              'ordenes'),
      ('order_items',         'ordenes'),
      ('inventory',           'inventario'),
      ('inventory_movements', 'inventario'),
      ('invoices',            'facturacion'),
      ('payments',            'pagos'),
      ('appointments',        'calendario'),
      ('ai_conversations',    'ia_agente'),
      ('ai_messages',         'ia_agente')
    ) as t(tbl, mod)
  loop
    execute format('drop policy if exists tenant_isolation on %I;', rec.tbl);

    execute format($f$
      create policy %I on %I
        for select to authenticated
        using (
          (app.is_super_admin() or organization_id = app.current_org_id())
          and app.org_has_module(%L) and app.has_perm(%L, 'ver')
        );
    $f$, rec.tbl || '_select', rec.tbl, rec.mod, rec.mod);

    execute format($f$
      create policy %I on %I
        for insert to authenticated
        with check (
          (app.is_super_admin() or organization_id = app.current_org_id())
          and app.org_has_module(%L) and app.has_perm(%L, 'crear')
        );
    $f$, rec.tbl || '_insert', rec.tbl, rec.mod, rec.mod);

    execute format($f$
      create policy %I on %I
        for update to authenticated
        using (
          (app.is_super_admin() or organization_id = app.current_org_id())
          and app.has_perm(%L, 'editar')
        )
        with check (
          app.is_super_admin() or organization_id = app.current_org_id()
        );
    $f$, rec.tbl || '_update', rec.tbl, rec.mod);

    execute format($f$
      create policy %I on %I
        for delete to authenticated
        using ( app.is_super_admin() );
    $f$, rec.tbl || '_delete', rec.tbl);
  end loop;
end $$;

-- subscriptions y org_counters: solo org-match por operación (sin módulo ni
-- permiso); DELETE solo super_admin.
do $$
declare
  t text;
begin
  foreach t in array array['subscriptions','org_counters'] loop
    execute format('drop policy if exists tenant_isolation on %I;', t);
    execute format($f$
      create policy %I on %I
        for select to authenticated
        using ( app.is_super_admin() or organization_id = app.current_org_id() );
    $f$, t || '_select', t);
    execute format($f$
      create policy %I on %I
        for insert to authenticated
        with check ( app.is_super_admin() or organization_id = app.current_org_id() );
    $f$, t || '_insert', t);
    execute format($f$
      create policy %I on %I
        for update to authenticated
        using ( app.is_super_admin() or organization_id = app.current_org_id() )
        with check ( app.is_super_admin() or organization_id = app.current_org_id() );
    $f$, t || '_update', t);
    execute format($f$
      create policy %I on %I
        for delete to authenticated
        using ( app.is_super_admin() );
    $f$, t || '_delete', t);
  end loop;
end $$;

-- RLS de role_permissions: los miembros leen los defaults globales + los
-- overrides de su org (para construir el PermissionMap); escritura de
-- overrides propios con permiso config/configurar; DELETE solo super_admin.
alter table role_permissions enable row level security;
create policy role_permissions_select on role_permissions
  for select to authenticated
  using (
    app.is_super_admin()
    or organization_id is null
    or organization_id = app.current_org_id()
  );
create policy role_permissions_insert on role_permissions
  for insert to authenticated
  with check (
    app.is_super_admin()
    or (organization_id = app.current_org_id() and app.has_perm('config','configurar'))
  );
create policy role_permissions_update on role_permissions
  for update to authenticated
  using (
    app.is_super_admin()
    or (organization_id = app.current_org_id() and app.has_perm('config','configurar'))
  )
  with check (
    app.is_super_admin()
    or (organization_id = app.current_org_id() and app.has_perm('config','configurar'))
  );
create policy role_permissions_delete on role_permissions
  for delete to authenticated
  using ( app.is_super_admin() );

-- ----------------------------------------------------------------------------
-- C1.5 · CUSTOM_FIELD_DEFS (base, sin UI; los valores viven en el jsonb del
-- recurso: product_variants.attributes hoy, columna custom en documentos F1)
-- ----------------------------------------------------------------------------
create table custom_field_defs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  module_key      text not null,
  field_key       text not null,          -- snake_case
  label           text not null,
  field_type      text not null check (field_type in ('text','number','date','select','bool')),
  required        boolean not null default false,
  options         jsonb not null default '[]'::jsonb,  -- para 'select'
  sort            int not null default 0,
  active          boolean not null default true,
  unique (organization_id, module_key, field_key)
);
create index idx_cfd_org on custom_field_defs(organization_id, module_key);

alter table custom_field_defs enable row level security;
create policy custom_field_defs_select on custom_field_defs
  for select to authenticated
  using ( app.is_super_admin() or organization_id = app.current_org_id() );
create policy custom_field_defs_insert on custom_field_defs
  for insert to authenticated
  with check (
    (app.is_super_admin() or organization_id = app.current_org_id())
    and app.has_perm('config','configurar')
  );
create policy custom_field_defs_update on custom_field_defs
  for update to authenticated
  using (
    (app.is_super_admin() or organization_id = app.current_org_id())
    and app.has_perm('config','configurar')
  )
  with check (
    app.is_super_admin() or organization_id = app.current_org_id()
  );
create policy custom_field_defs_delete on custom_field_defs
  for delete to authenticated
  using ( app.is_super_admin() );

-- ----------------------------------------------------------------------------
-- C1.6 · Catálogos SAT globales (subconjunto razonable para PyME)
-- Lectura authenticated (anon NO); escritura solo super_admin (patrón plans).
-- Se crean ANTES de los ALTER de maestros: el default 'H87' de
-- product_variants.clave_unidad depende de la fila del catálogo.
-- ----------------------------------------------------------------------------
create table sat_regimen_fiscal (
  code  text primary key,
  label text not null
);
create table sat_uso_cfdi (
  code  text primary key,
  label text not null
);
create table sat_clave_unidad (
  code  text primary key,
  label text not null
);

insert into sat_regimen_fiscal (code, label) values
  ('601','General de Ley Personas Morales'),
  ('603','Personas Morales con Fines no Lucrativos'),
  ('605','Sueldos y Salarios e Ingresos Asimilados a Salarios'),
  ('606','Arrendamiento'),
  ('612','Personas Físicas con Actividades Empresariales y Profesionales'),
  ('616','Sin obligaciones fiscales'),
  ('621','Incorporación Fiscal'),
  ('626','Régimen Simplificado de Confianza')
on conflict (code) do nothing;

insert into sat_uso_cfdi (code, label) values
  ('G01','Adquisición de mercancías'),
  ('G02','Devoluciones, descuentos o bonificaciones'),
  ('G03','Gastos en general'),
  ('I01','Construcciones'),
  ('I04','Equipo de cómputo y accesorios'),
  ('D01','Honorarios médicos, dentales y gastos hospitalarios'),
  ('D10','Pagos por servicios educativos (colegiaturas)'),
  ('P01','Por definir'),
  ('S01','Sin efectos fiscales'),
  ('CP01','Pagos')
on conflict (code) do nothing;

insert into sat_clave_unidad (code, label) values
  ('H87','Pieza'),
  ('E48','Unidad de servicio'),
  ('KGM','Kilogramo'),
  ('LTR','Litro'),
  ('MTR','Metro'),
  ('XBX','Caja'),
  ('EA','Elemento'),
  ('ACT','Actividad')
on conflict (code) do nothing;

alter table sat_regimen_fiscal enable row level security;
alter table sat_uso_cfdi       enable row level security;
alter table sat_clave_unidad   enable row level security;

create policy sat_regimen_read on sat_regimen_fiscal
  for select to authenticated using ( true );
create policy sat_regimen_super_write on sat_regimen_fiscal
  for all to authenticated
  using ( app.is_super_admin() ) with check ( app.is_super_admin() );

create policy sat_uso_read on sat_uso_cfdi
  for select to authenticated using ( true );
create policy sat_uso_super_write on sat_uso_cfdi
  for all to authenticated
  using ( app.is_super_admin() ) with check ( app.is_super_admin() );

create policy sat_unidad_read on sat_clave_unidad
  for select to authenticated using ( true );
create policy sat_unidad_super_write on sat_clave_unidad
  for all to authenticated
  using ( app.is_super_admin() ) with check ( app.is_super_admin() );

-- ----------------------------------------------------------------------------
-- C1.6 · Maestros — columnas nuevas + migración de datos + validación RFC
-- ----------------------------------------------------------------------------
alter table products
  add column tipo text not null default 'producto'
    constraint products_tipo_check check (tipo in ('producto','servicio')),
  add column clave_prod_serv text,                              -- SAT c_ClaveProdServ
  add column iva_rate numeric(4,3) not null default 0.160;

-- El NOT NULL DEFAULT 'H87' rellena las filas existentes; la FK exige que el
-- catálogo sat_clave_unidad ya esté sembrado (arriba).
alter table product_variants
  add column clave_unidad text not null default 'H87'
    constraint product_variants_clave_unidad_fkey
    references sat_clave_unidad(code) on update cascade;

alter table customers
  add column cp text
    constraint customers_cp_format check (cp ~ '^[0-9]{5}$'),   -- NULL permitido
  add column regimen_code text
    constraint customers_regimen_code_fkey
    references sat_regimen_fiscal(code) on update cascade,
  add column uso_cfdi_code text
    constraint customers_uso_cfdi_code_fkey
    references sat_uso_cfdi(code) on update cascade,
  add column active boolean not null default true;      -- soft-inactivar (CustomerRow.active)

-- Migración de datos existentes: extraer el código del formato
-- "601 · Descripción" SOLO si existe en el catálogo; si no, queda NULL.
update customers c
   set regimen_code = split_part(c.regimen_fiscal, ' · ', 1)
 where c.regimen_fiscal is not null
   and exists (select 1 from sat_regimen_fiscal s
                where s.code = split_part(c.regimen_fiscal, ' · ', 1));

update customers c
   set uso_cfdi_code = split_part(c.uso_cfdi, ' · ', 1)
 where c.uso_cfdi is not null
   and exists (select 1 from sat_uso_cfdi s
                where s.code = split_part(c.uso_cfdi, ' · ', 1));

-- Validación de RFC (CFDI 4.0). NULL permitido; XAXX010101000/XEXX010101000
-- pasan por el patrón. Verificado contra los RFC vivos del seed antes de
-- escribir esta migración.
alter table customers
  add constraint customers_rfc_format
  check (rfc is null or rfc ~* '^([A-ZÑ&]{3,4})[0-9]{6}[A-Z0-9]{3}$');

-- ----------------------------------------------------------------------------
-- C1.1 · Seed de defaults globales de role_permissions (organization_id NULL)
-- 3 roles de tenant × 11 module_keys × 5 acciones = 165 filas.
-- tenant_admin: todo · tenant_user (Operador): ver/crear/editar ·
-- tenant_viewer (Solo-lectura): solo ver.
-- ----------------------------------------------------------------------------
insert into role_permissions (organization_id, role, module_key, action, allowed)
select
  null,
  r.role,
  m.module_key,
  a.action,
  case
    when r.role = 'tenant_admin' then true
    when r.role = 'tenant_user'  then a.action in ('ver','crear','editar')
    else a.action = 'ver'   -- tenant_viewer
  end
from unnest(array['tenant_admin','tenant_user','tenant_viewer']::user_role[]) as r(role)
cross join unnest(array[
  'dashboard','ordenes','calendario','pagos','inventario','facturacion',
  'crm','ia_agente','config','reservas_whatsapp','maestros'
]) as m(module_key)
cross join unnest(array['ver','crear','editar','cancelar','configurar']) as a(action)
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- C0 · Grants base de Supabase (anon / authenticated / service_role)
-- GAP PREEXISTENTE: ninguna migración 0001–0008 otorgó privilegios de TABLA a
-- estos roles, así que el acceso vía RLS nunca funcionó contra Supabase real
-- (el producto solo había corrido en modo demo). RLS sigue siendo el filtro
-- POR FILA; estos grants dan el privilegio de tabla que la RLS presupone.
-- Cubre todas las tablas creadas hasta aquí (0001–0010). `alter default
-- privileges` cubre las tablas de fases futuras (F1+). Idempotente y estándar
-- de Supabase, seguro también en el entorno hosteado.
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables      in schema public to anon, authenticated, service_role;
grant all on all sequences   in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all     on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all     on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- ============================================================================
-- ROLLBACK: (documentación, no ejecutable — orden seguro de reversa)
--
-- -- 1) Maestros: constraints y columnas nuevas
-- alter table customers drop constraint if exists customers_rfc_format;
-- alter table customers drop column if exists active;
-- alter table customers drop column if exists uso_cfdi_code;
-- alter table customers drop column if exists regimen_code;
-- alter table customers drop column if exists cp;
-- alter table product_variants drop column if exists clave_unidad;
-- alter table products drop column if exists iva_rate;
-- alter table products drop column if exists clave_prod_serv;
-- alter table products drop column if exists tipo;
--
-- -- 2) Catálogos SAT (después de soltar las FKs vía drop column)
-- drop table if exists sat_clave_unidad;
-- drop table if exists sat_uso_cfdi;
-- drop table if exists sat_regimen_fiscal;
--
-- -- 3) Campos personalizados
-- drop table if exists custom_field_defs;
--
-- -- 4) transition_order: restaurar v1 (cuerpo exacto de 0003 L126-165,
-- --    sin has_perm ni log_audit)
-- -- create or replace function public.transition_order(...) ... (ver 0003)
--
-- -- 5) Auditoría
-- drop function if exists app.log_audit(text, text, text, jsonb, uuid);
-- drop table if exists audit_log;
--
-- -- 6) RLS: eliminar políticas por operación y restaurar tenant_isolation
-- -- do $$ declare t text; begin
-- --   foreach t in array array['customers','products','product_variants',
-- --     'price_lists','price_list_items','warehouses','orders','order_items',
-- --     'inventory','inventory_movements','invoices','payments','appointments',
-- --     'ai_conversations','ai_messages','subscriptions','org_counters'] loop
-- --     execute format('drop policy if exists %I on %I;', t || '_select', t);
-- --     execute format('drop policy if exists %I on %I;', t || '_insert', t);
-- --     execute format('drop policy if exists %I on %I;', t || '_update', t);
-- --     execute format('drop policy if exists %I on %I;', t || '_delete', t);
-- --     execute format($f$
-- --       create policy tenant_isolation on %I
-- --         for all to authenticated
-- --         using ( app.is_super_admin() or organization_id = app.current_org_id() )
-- --         with check ( app.is_super_admin() or organization_id = app.current_org_id() );
-- --     $f$, t);
-- --   end loop;
-- -- end $$;
--
-- -- 7) current_org_id: restaurar v1 (cuerpo exacto de 0002 L28-41, solo GUC)
--
-- -- 8) Helpers RBAC + wrappers y tabla role_permissions
-- drop function if exists public.org_has_module(text);
-- drop function if exists public.has_perm(text, text);
-- drop function if exists app.org_has_module(text);
-- drop function if exists app.has_perm(text, text);
-- drop table if exists role_permissions;
-- ============================================================================
