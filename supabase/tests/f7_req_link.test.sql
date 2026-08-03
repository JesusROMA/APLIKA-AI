-- ============================================================================
-- pgTAP — F7 · Requisición ↔ OC (purchase_orders.requisition_id, 0022)
--   · La columna requisition_id existe y es un FK a requisitions.
--   · Una OC acepta un requisition_id válido (insert OK).
--   · El join requisición → OC devuelve la OC ligada.
-- Setup como postgres (bypassa RLS): solo prueba la FK y el join.
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(3);

create extension if not exists pgtap;

-- --- Fixtures ----------------------------------------------------------------
insert into organizations (id, slug, name) values
  ('c7d00000-0000-0000-0000-000000000001','f7reqorg','F7 Req Link Org');
insert into suppliers (id, organization_id, name) values
  ('c7d55555-0000-0000-0000-000000000001','c7d00000-0000-0000-0000-000000000001','Proveedor F7');
insert into requisitions (id, organization_id, folio, status) values
  ('c7d99999-0000-0000-0000-000000000001','c7d00000-0000-0000-0000-000000000001','REQ-A-0001','aprobada');

-- ============ (1) La columna requisition_id existe ===========================
select has_column('purchase_orders', 'requisition_id',
  'purchase_orders tiene la columna requisition_id');

-- ============ (2) Una OC acepta un requisition_id válido (FK) =================
select lives_ok(
  $$ insert into purchase_orders
       (id, organization_id, folio, supplier_id, requisition_id, status)
     values ('c7daaaaa-0000-0000-0000-000000000001',
             'c7d00000-0000-0000-0000-000000000001','OC-A-0001',
             'c7d55555-0000-0000-0000-000000000001',
             'c7d99999-0000-0000-0000-000000000001','borrador') $$,
  'purchase_orders acepta un requisition_id válido (FK)'
);

-- ============ (3) El join requisición → OC devuelve la OC ligada =============
select is(
  (select po.folio
     from requisitions r
     join purchase_orders po on po.requisition_id = r.id
    where r.id = 'c7d99999-0000-0000-0000-000000000001'),
  'OC-A-0001',
  'El join requisición → OC devuelve la OC ligada'
);

select finish();
rollback;
