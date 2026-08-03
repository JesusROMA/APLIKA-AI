-- ============================================================================
-- FASE 4 · Transversales — migración MÍNIMA (contrato F4 · C1)
--
-- El "motor" transversal YA existe (NO se recrea aquí):
--   · organizations.logo_url / brand_color / custom_domain ........ 0010
--   · custom_field_defs (+ RLS select/insert/update/delete) ........ 0010
--   · audit_log (+ app.log_audit, RLS SELECT super_admin|tenant_admin) 0010
--   · role_permissions (+ RLS overrides del tenant con config/configurar) 0010
--   · org_series (+ RLS CRUD del tenant con config/configurar) ...... 0012
--
-- Esta migración solo aporta lo que faltaba:
--   1) customers.custom jsonb   — soporte de campos personalizados en clientes.
--   2) app.set_org_module()     — autoservicio de módulos por el dueño
--      (la RLS de organization_modules es SOLO super_admin, 0005 → hace falta RPC).
-- Idempotente. Helpers usados: app.has_perm, app.current_org_id, app.log_audit.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Campos personalizados sobre el maestro de clientes
--     (demostración de custom_field_defs; el <CustomFields> del panel escribe aquí)
-- ----------------------------------------------------------------------------
alter table customers add column if not exists custom jsonb not null default '{}';

-- ----------------------------------------------------------------------------
-- 2 · Autoservicio de módulos: el dueño (config/configurar) activa/desactiva
--     módulos de SU tenant. La RLS directa de organization_modules es
--     solo super_admin (org_modules_super_write, 0005) ⇒ se necesita este RPC.
-- ----------------------------------------------------------------------------
create or replace function app.set_org_module(p_module_key text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public, app as $$
declare
  v_org uuid := app.current_org_id();
  v_mod uuid;
begin
  if not app.has_perm('config','configurar') then
    raise exception 'forbidden: falta permiso config/configurar' using errcode = '42501';
  end if;
  if v_org is null then
    raise exception 'sin organización de contexto';
  end if;
  select id into v_mod from modules where key = p_module_key;
  if v_mod is null then
    raise exception 'módulo inexistente: %', p_module_key;
  end if;
  insert into organization_modules (organization_id, module_id, enabled)
    values (v_org, v_mod, p_enabled)
  on conflict (organization_id, module_id) do update set enabled = excluded.enabled;
  perform app.log_audit(
    'module', p_module_key,
    case when p_enabled then 'activar' else 'desactivar' end,
    '{}'::jsonb, v_org
  );
end; $$;

-- Wrapper público (PostgREST solo expone `public`; mismo patrón que 0012).
create or replace function public.set_org_module(p_module_key text, p_enabled boolean)
returns void language sql security definer set search_path = public, app as $$
  select app.set_org_module(p_module_key, p_enabled);
$$;
grant execute on function public.set_org_module(text, boolean) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3 · Autoservicio de branding: el dueño (config/configurar) edita logo/color
--     de SU tenant. La RLS directa de organizations es solo super_admin
--     (org_super_write, 0002/0010) ⇒ se necesita este RPC.
-- ----------------------------------------------------------------------------
create or replace function app.set_org_branding(p_logo_url text, p_brand_color text)
returns void language plpgsql security definer set search_path = public, app as $$
declare v_org uuid := app.current_org_id();
begin
  if not app.has_perm('config','configurar') then
    raise exception 'forbidden: falta permiso config/configurar' using errcode = '42501';
  end if;
  if v_org is null then
    raise exception 'sin organización de contexto';
  end if;
  update organizations
     set logo_url = p_logo_url, brand_color = p_brand_color, updated_at = now()
   where id = v_org;
  perform app.log_audit('organization', v_org::text, 'branding',
    jsonb_build_object('logo_url', p_logo_url, 'brand_color', p_brand_color), v_org);
end; $$;

create or replace function public.set_org_branding(p_logo_url text, p_brand_color text)
returns void language sql security definer set search_path = public, app as $$
  select app.set_org_branding(p_logo_url, p_brand_color);
$$;
grant execute on function public.set_org_branding(text, text) to authenticated, service_role;

-- ============================================================================
-- Grants base (idéntico al bloque de 0010/0012 — idempotente y seguro).
-- ============================================================================
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables      in schema public to anon, authenticated, service_role;
grant all on all sequences   in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all     on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all     on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- ============================================================================
-- ROLLBACK (documental):
--   drop function if exists public.set_org_branding(text, text);
--   drop function if exists app.set_org_branding(text, text);
--   drop function if exists public.set_org_module(text, boolean);
--   drop function if exists app.set_org_module(text, boolean);
--   alter table customers drop column if exists custom;
-- ============================================================================
