-- ============================================================================
-- pgTAP — F1 · Series de folio (0012 · C1.1)
-- next_serie_folio devuelve "PREFIX-SERIE-0001" y es consecutivo por doc_type.
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(4);

create extension if not exists pgtap;

-- Org nueva (creada en la tx del test ⇒ sin filas org_series del seed de la
-- migración; next_serie_folio debe autocrear la serie arrancando en 0001).
insert into organizations (id, slug, name) values
  ('f1000000-0000-0000-0000-000000000001','folorg','Folio Org');

-- (1) Primer folio de cotización
select is(
  public.next_serie_folio('f1000000-0000-0000-0000-000000000001','quote'),
  'COT-A-0001',
  'Primer folio de cotización = COT-A-0001'
);

-- (2) Segundo consecutivo
select is(
  public.next_serie_folio('f1000000-0000-0000-0000-000000000001','quote'),
  'COT-A-0002',
  'Segundo folio consecutivo de cotización = COT-A-0002'
);

-- (3) Otro doc_type usa su propio prefijo y su propio contador
select is(
  public.next_serie_folio('f1000000-0000-0000-0000-000000000001','order'),
  'PED-A-0001',
  'Folio de pedido = PED-A-0001 (contador independiente)'
);

-- (4) Serie explícita distinta de la default
select is(
  public.next_serie_folio('f1000000-0000-0000-0000-000000000001','invoice','B'),
  'FAC-B-0001',
  'Folio de factura serie B = FAC-B-0001'
);

select finish();
rollback;
