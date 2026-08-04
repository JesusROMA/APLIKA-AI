-- ============================================================================
-- 0024 · F8 Sincronización E2E — cotización con almacén y lista de precios
-- La cotización selecciona explícitamente la LISTA DE PRECIOS (default: la del
-- cliente) y el ALMACÉN de salida; ambos se heredan al pedido al convertir
-- (la salida de stock ocurre en ese almacén). Ver docs/erp/F8-CONTRATOS.md.
-- ============================================================================
alter table quotes
  add column if not exists warehouse_id  uuid references warehouses(id),
  add column if not exists price_list_id uuid references price_lists(id);

-- ROLLBACK:
--   alter table quotes drop column if exists price_list_id;
--   alter table quotes drop column if exists warehouse_id;
