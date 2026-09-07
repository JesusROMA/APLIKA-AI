-- ============================================================================
-- Aplika.ai — 0026 · Maestros como módulos reales asignables por tenant
-- El módulo virtual 'maestros' (siempre activo para todos) se parte en 5
-- módulos de catálogo, uno por maestro, para que el super-admin los asigne
-- por cliente desde el drawer de Módulos (organization_modules):
--   maestro_clientes · maestro_proveedores · maestro_productos ·
--   maestro_almacenes · maestro_precios
-- Sin pérdida: se habilitan para todos los tenants existentes, se agregan a
-- los defaults de todos los verticales, y los permisos RBAC del key
-- 'maestros' (globales y overrides) se copian a cada key nuevo.
-- ============================================================================

-- 1) Catálogo de módulos (core=false ⇒ asignables/desactivables por tenant).
insert into modules (key, name, icon, route_prefix, requires, core, sort) values
  ('maestro_clientes',   'Maestro · Clientes',
   'M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
   'clientes', '[]', false, 20),
  ('maestro_proveedores','Maestro · Proveedores',
   'M1 3h15v13H1zM16 8h4l3 3v5h-7M5.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm12 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
   'proveedores', '[]', false, 21),
  ('maestro_productos',  'Maestro · Productos',
   'M20 7 12 3 4 7l8 4 8-4Zm0 0v10l-8 4-8-4V7',
   'productos', '[]', false, 22),
  ('maestro_almacenes',  'Maestro · Almacenes',
   'M3 21V9l9-5 9 5v12M9 21v-6h6v6',
   'almacenes', '[]', false, 23),
  ('maestro_precios',    'Maestro · Listas de precios',
   'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
   'listas-precios', '[]', false, 24)
on conflict (key) do nothing;

-- 2) Habilitarlos en TODOS los tenants existentes (hoy todos ven maestros).
insert into organization_modules (organization_id, module_id, enabled)
select o.id, m.id, true
  from organizations o
  cross join modules m
 where m.key in ('maestro_clientes','maestro_proveedores','maestro_productos',
                 'maestro_almacenes','maestro_precios')
on conflict (organization_id, module_id) do nothing;

-- 3) Defaults de vertical: los tenants nuevos también los reciben.
update verticals
   set default_modules =
     (select jsonb_agg(distinct e)
        from jsonb_array_elements_text(
          default_modules
          || '["maestro_clientes","maestro_proveedores","maestro_productos","maestro_almacenes","maestro_precios"]'::jsonb
        ) e);

-- 4) RBAC: copiar los permisos del key 'maestros' (globales y overrides de
--    tenant) a cada key nuevo, y retirar el key virtual.
insert into role_permissions (organization_id, role, module_key, action, allowed)
select rp.organization_id, rp.role, nk.key, rp.action, rp.allowed
  from role_permissions rp
  cross join (values ('maestro_clientes'),('maestro_proveedores'),('maestro_productos'),
                     ('maestro_almacenes'),('maestro_precios')) as nk(key)
 where rp.module_key = 'maestros'
on conflict (organization_id, role, module_key, action) do nothing;

delete from role_permissions where module_key = 'maestros';

-- 5) La RPC de listas de precios (0023) ahora exige el permiso del maestro
--    específico. Cuerpo idéntico al de 0023; solo cambia la línea del guard.
--    (El wrapper public.replace_price_list_items no cambia.)
create or replace function app.replace_price_list_items(p_list uuid, p_items jsonb)
returns integer
language plpgsql security definer set search_path = public, app as $$
declare
  v_org uuid := app.current_org_id();
  v_ids uuid[];
  v_count integer;
begin
  if not app.has_perm('maestro_precios','editar') then
    raise exception 'forbidden: falta permiso maestro_precios/editar' using errcode = '42501';
  end if;
  if v_org is null then raise exception 'sin organización de contexto'; end if;

  -- La lista debe pertenecer al tenant.
  perform 1 from price_lists where id = p_list and organization_id = v_org;
  if not found then raise exception 'lista de precios no encontrada' using errcode = 'P0002'; end if;

  select coalesce(array_agg((e->>'productVariantId')::uuid), array[]::uuid[]) into v_ids
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e;

  -- Borra los items que ya no están en el set enviado.
  delete from price_list_items
   where price_list_id = p_list and not (product_variant_id = any(v_ids));

  -- Agrega/actualiza los enviados.
  insert into price_list_items (organization_id, price_list_id, product_variant_id, price_mxn)
  select v_org, p_list, (e->>'productVariantId')::uuid, (e->>'priceMxn')::numeric
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  on conflict (price_list_id, product_variant_id) do update set price_mxn = excluded.price_mxn;

  select count(*) into v_count from price_list_items where price_list_id = p_list;
  perform app.log_audit('price_list', p_list::text, 'set_items',
    jsonb_build_object('items', v_count), v_org);
  return v_count;
end; $$;

-- 6) app.org_has_module: 'maestros' deja de ser virtual (queda dashboard/config).
create or replace function app.org_has_module(p_module text)
returns boolean
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_org uuid;
begin
  if auth.role() = 'service_role' then return true; end if;
  if app.is_super_admin() then return true; end if;

  v_org := app.current_org_id();
  if p_module in ('dashboard','config') then
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

-- 7) RLS de los maestros: cada tabla gatea por SU módulo (antes 'maestros').
--    Mismas expresiones de 0010, solo cambia el key.
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('customers',        'maestro_clientes'),
      ('products',         'maestro_productos'),
      ('product_variants', 'maestro_productos'),
      ('price_lists',      'maestro_precios'),
      ('price_list_items', 'maestro_precios'),
      ('warehouses',       'maestro_almacenes'),
      ('suppliers',        'maestro_proveedores')  -- antes gateaba por 'compras'
    ) as v(tbl, mod)
  loop
    execute format(
      'alter policy %I on %I using ((app.is_super_admin() or organization_id = app.current_org_id())
         and app.org_has_module(%L) and app.has_perm(%L, ''ver''))',
      t.tbl || '_select', t.tbl, t.mod, t.mod);
    execute format(
      'alter policy %I on %I with check ((app.is_super_admin() or organization_id = app.current_org_id())
         and app.org_has_module(%L) and app.has_perm(%L, ''crear''))',
      t.tbl || '_insert', t.tbl, t.mod, t.mod);
    execute format(
      'alter policy %I on %I using ((app.is_super_admin() or organization_id = app.current_org_id())
         and app.has_perm(%L, ''editar''))
         with check (app.is_super_admin() or organization_id = app.current_org_id())',
      t.tbl || '_update', t.tbl, t.mod);
  end loop;
end $$;
