-- ============================================================================
-- pgTAP — F4 · Configuración por tenant (0017 · C1 + RBAC overrides · 0010)
--   · set_org_module: tenant_admin (config/configurar) desactiva/activa un
--     módulo de SU tenant vía RPC ⇒ organization_modules.enabled cambia.
--   · set_org_module: tenant_user (sin config/configurar) ⇒ 42501.
--   · Override RBAC: tenant_admin inserta un override (ordenes/crear=false para
--     tenant_user) y app.has_perm de un tenant_user pasa a false (override gana
--     al default global true).
-- Identidades del seed: ADMIN refanorte b1 (tenant_admin), OPER b4 (tenant_user),
-- org refanorte 11111111-1111-1111-1111-111111111111.
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(5);

create extension if not exists pgtap;

-- --- Helper para simular usuario autenticado ---------------------------------
create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

-- ============ (1) tenant_admin DESACTIVA el módulo 'inventario' ==============
select _login('d0000000-0000-0000-0000-0000000000b1');
select lives_ok(
  $$ select set_org_module('inventario', false) $$,
  'tenant_admin (config/configurar) desactiva el módulo inventario vía RPC'
);

-- ============ (2) …y organization_modules.enabled quedó en false ============
select is(
  (select om.enabled
     from organization_modules om
     join modules m on m.id = om.module_id
    where om.organization_id = '11111111-1111-1111-1111-111111111111'
      and m.key = 'inventario'),
  false,
  'organization_modules.enabled = false para inventario en refanorte'
);

-- ============ (3) tenant_admin REACTIVA el módulo ⇒ enabled = true ===========
select _login('d0000000-0000-0000-0000-0000000000b1');
select set_org_module('inventario', true);
select is(
  (select om.enabled
     from organization_modules om
     join modules m on m.id = om.module_id
    where om.organization_id = '11111111-1111-1111-1111-111111111111'
      and m.key = 'inventario'),
  true,
  'reactivar el módulo deja organization_modules.enabled = true'
);

-- ============ (4) tenant_user (sin config/configurar) ⇒ 42501 ================
select _login('d0000000-0000-0000-0000-0000000000b4');
select throws_ok(
  $$ select set_org_module('inventario', false) $$,
  '42501', NULL,
  'tenant_user sin config/configurar NO puede set_org_module (42501)'
);

-- ============ (5) Override RBAC: ordenes/crear=false para tenant_user ========
-- Precondición: por defecto global (org null) tenant_user tiene ordenes/crear=true,
-- de modo que has_perm de b4 sería true sin el override.
select _login('d0000000-0000-0000-0000-0000000000b1');   -- tenant_admin: config/configurar
insert into role_permissions (organization_id, role, module_key, action, allowed)
values ('11111111-1111-1111-1111-111111111111','tenant_user','ordenes','crear', false)
on conflict (organization_id, role, module_key, action) do update set allowed = excluded.allowed;

select _login('d0000000-0000-0000-0000-0000000000b4');   -- tenant_user afectado
select is(
  public.has_perm('ordenes','crear'),
  false,
  'El override del tenant (allowed=false) gana al default global true'
);

select finish();
rollback;
