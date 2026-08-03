-- ============================================================================
-- pgTAP — F7 · next_serie_folio v5 (0022)
--   · 'invoice'          → FAC-A-0001 y consecutivo FAC-A-0002.
--   · 'supplier_invoice' → FP-A-0001 (nuevo prefijo F7).
--   · Conserva prefijos previos: 'quote'→COT, 'purchase'→OC.
-- Org creada dentro de la tx ⇒ sin filas del seed de la migración; el folio
-- autocrea la serie arrancando en 0001 con el prefijo correcto.
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(5);

create extension if not exists pgtap;

insert into organizations (id, slug, name) values
  ('c7f00000-0000-0000-0000-000000000001','f7folorg','F7 Folio Org');

-- ============ (1) Factura → FAC-A-0001 =======================================
select is(
  public.next_serie_folio('c7f00000-0000-0000-0000-000000000001','invoice'),
  'FAC-A-0001',
  'Primer folio de factura = FAC-A-0001'
);

-- ============ (2) Factura consecutiva → FAC-A-0002 ===========================
select is(
  public.next_serie_folio('c7f00000-0000-0000-0000-000000000001','invoice'),
  'FAC-A-0002',
  'Segundo folio de factura consecutivo = FAC-A-0002'
);

-- ============ (3) Factura de proveedor (CxP) → FP-A-0001 =====================
select is(
  public.next_serie_folio('c7f00000-0000-0000-0000-000000000001','supplier_invoice'),
  'FP-A-0001',
  'Folio interno de CxP = FP-A-0001'
);

-- ============ (4) Conserva cotización → COT-A-0001 ===========================
select is(
  public.next_serie_folio('c7f00000-0000-0000-0000-000000000001','quote'),
  'COT-A-0001',
  'Folio de cotización conservado = COT-A-0001'
);

-- ============ (5) Conserva orden de compra → OC-A-0001 =======================
select is(
  public.next_serie_folio('c7f00000-0000-0000-0000-000000000001','purchase'),
  'OC-A-0001',
  'Folio de orden de compra conservado = OC-A-0001'
);

select finish();
rollback;
