-- ============================================================================
-- pgTAP — F7 · CRM prospectos (crm_prospects, módulo 'crm', 0022)
--   · tenant_admin CON módulo 'crm' inserta un prospecto (OK).
--   · tenant SIN módulo 'crm' NO puede insertar (RLS ⇒ 42501).
--   · Cambio de etapa (stage) de un prospecto propio (OK).
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(3);

create extension if not exists pgtap;

-- --- Setup (como postgres; bypassa RLS) --------------------------------------
-- Org A: CON módulo 'crm'; un tenant_admin.
insert into organizations (id, slug, name) values
  ('c7a00000-0000-0000-0000-000000000001','f7crmA','F7 CRM A');
insert into organization_modules (organization_id, module_id, enabled)
select 'c7a00000-0000-0000-0000-000000000001', id, true
  from modules where key = 'crm'
on conflict do nothing;
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','c7a11111-0000-0000-0000-000000000001','authenticated','authenticated','admin@f7crma.mx');
update profiles set organization_id='c7a00000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='c7a11111-0000-0000-0000-000000000001';

-- Org B: SIN módulo 'crm'; un tenant_admin.
insert into organizations (id, slug, name) values
  ('c7b00000-0000-0000-0000-000000000001','f7crmB','F7 CRM B');
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','c7b11111-0000-0000-0000-000000000001','authenticated','authenticated','admin@f7crmb.mx');
update profiles set organization_id='c7b00000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='c7b11111-0000-0000-0000-000000000001';

create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

-- ============ (1) tenant_admin CON módulo crm ⇒ inserta prospecto ============
select _login('c7a11111-0000-0000-0000-000000000001');
select lives_ok(
  $$ insert into crm_prospects (organization_id, name, contact_name, stage)
     values ('c7a00000-0000-0000-0000-000000000001','Prospecto Uno','Ana','nuevo') $$,
  'tenant_admin con módulo crm inserta en crm_prospects (RLS)'
);

-- ============ (2) tenant SIN módulo crm ⇒ NO inserta (42501) ==================
select _login('c7b11111-0000-0000-0000-000000000001');
select throws_ok(
  $$ insert into crm_prospects (organization_id, name)
     values ('c7b00000-0000-0000-0000-000000000001','Prospecto B') $$,
  '42501', NULL,
  'Tenant sin módulo crm NO puede insertar en crm_prospects (RLS)'
);

-- ============ (3) Cambio de etapa de un prospecto propio ======================
select _login('c7a11111-0000-0000-0000-000000000001');
update crm_prospects set stage = 'contactado'
 where organization_id = 'c7a00000-0000-0000-0000-000000000001' and name = 'Prospecto Uno';
select is(
  (select stage::text from crm_prospects
    where organization_id = 'c7a00000-0000-0000-0000-000000000001' and name = 'Prospecto Uno'),
  'contactado',
  'El prospecto cambia de etapa nuevo → contactado'
);

select finish();
rollback;
