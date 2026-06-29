-- ============================================================================
-- Aplika.ai — 0004 · Storage (XML/PDF de CFDI y branding)
-- Buckets privados; las rutas se prefijan con el organization_id para aislar.
-- ============================================================================

insert into storage.buckets (id, name, public) values
  ('cfdi', 'cfdi', false),
  ('branding', 'branding', true)
on conflict (id) do nothing;

-- CFDI: cada usuario solo ve los archivos de su organización (carpeta = org id).
-- La subida la hace el servidor con service-role (bypassa RLS); estas políticas
-- cubren lecturas con la sesión del usuario.
create policy cfdi_read_own_org on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cfdi'
    and (
      app.is_super_admin()
      or (storage.foldername(name))[1] = app.current_org_id()::text
    )
  );

-- Branding es público de lectura (logos de tiendas).
create policy branding_public_read on storage.objects
  for select to anon, authenticated
  using ( bucket_id = 'branding' );

create policy branding_write_own_org on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = app.current_org_id()::text
  );
