-- ============================================================================
-- 0023 · Listas de precios — reemplazo real de items
-- El editor de precios necesita "lo que ves es lo que se guarda": agregar,
-- actualizar y ELIMINAR precios. La RLS de price_list_items restringe DELETE a
-- super_admin (0010), así que el borrado se hace vía este RPC SECURITY DEFINER
-- con permiso maestros/editar. Reemplaza el PUT upsert-only anterior.
-- ============================================================================
create or replace function app.replace_price_list_items(p_list uuid, p_items jsonb)
returns integer
language plpgsql security definer set search_path = public, app as $$
declare
  v_org uuid := app.current_org_id();
  v_ids uuid[];
  v_count integer;
begin
  if not app.has_perm('maestros','editar') then
    raise exception 'forbidden: falta permiso maestros/editar' using errcode = '42501';
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

create or replace function public.replace_price_list_items(p_list uuid, p_items jsonb)
returns integer language sql security definer set search_path = public, app as $$
  select app.replace_price_list_items(p_list, p_items);
$$;
grant execute on function public.replace_price_list_items(uuid, jsonb) to authenticated, service_role;

-- ROLLBACK:
--   drop function if exists public.replace_price_list_items(uuid, jsonb);
--   drop function if exists app.replace_price_list_items(uuid, jsonb);
