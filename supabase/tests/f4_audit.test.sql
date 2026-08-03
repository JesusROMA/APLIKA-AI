-- ============================================================================
-- pgTAP — F4 · Bitácora / Auditoría (audit_log · 0010, evento vía RPC · 0017)
--   · Un evento real (set_org_module → app.log_audit 'module') deja ≥1 fila en
--     audit_log para la org.
--   · RLS: el tenant_admin dueño SÍ ve la bitácora (>0); el tenant_user NO (0).
-- Identidades del seed: ADMIN refanorte b1 (tenant_admin), OPER b4 (tenant_user),
-- org refanorte 11111111-1111-1111-1111-111111111111.
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(3);

create extension if not exists pgtap;

-- --- Helper para simular usuario autenticado ---------------------------------
create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

-- ============ (1) Generar un evento auditable ===============================
-- set_org_module registra un evento 'module'/'desactivar' en audit_log para la org.
select _login('d0000000-0000-0000-0000-0000000000b1');
select set_org_module('inventario', false);

-- Hay ≥1 fila en la bitácora de la org por el evento recién generado.
select cmp_ok(
  (select count(*) from audit_log
    where organization_id = '11111111-1111-1111-1111-111111111111'
      and entity_type = 'module'),
  '>=', 1::bigint,
  'set_org_module dejó al menos 1 fila en audit_log (entity_type=module)'
);

-- ============ (2) RLS: tenant_admin SÍ ve la bitácora (>0) ==================
select cmp_ok(
  (select count(*) from audit_log),
  '>', 0::bigint,
  'tenant_admin dueño SÍ ve la bitácora (RLS SELECT)'
);

-- ============ (3) RLS: tenant_user NO ve la bitácora (0) ====================
select _login('d0000000-0000-0000-0000-0000000000b4');
select is(
  (select count(*)::int from audit_log),
  0,
  'tenant_user NO ve la bitácora (RLS lo excluye)'
);

select finish();
rollback;
