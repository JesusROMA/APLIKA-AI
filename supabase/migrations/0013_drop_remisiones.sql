-- ============================================================================
-- Aplika.ai — 0013 · Elimina REMISIONES (sales notes)
-- Decisión de producto (Jesús): la remisión es redundante con el pedido; el
-- flujo de ventas queda cotización → pedido → factura. Se retira el submódulo
-- completo (tablas, tipo, RPC, módulo, RBAC). Additivo-seguro: drop explícito.
-- ============================================================================

-- 1) RPC que devuelve el tipo de tabla (debe caer antes que la tabla).
drop function if exists public.cobrar_remision(uuid, text);

-- 2) Tablas (orden inverso de dependencias).
drop table if exists invoice_sales_notes;   -- candado de factura global
drop table if exists sales_note_items;
drop table if exists sales_notes;

-- 3) Enum ya sin uso.
drop type if exists sales_note_status;

-- 4) Series de folio y enlaces documentales de remisión (polimórficos, sin FK).
delete from org_series where doc_type = 'sales_note';
delete from document_links where src_type = 'sales_note' or dst_type = 'sales_note';

-- 5) Módulo 'remisiones': RBAC, activaciones por tenant, catálogo de vertical.
delete from role_permissions where module_key = 'remisiones';
delete from organization_modules om using modules m
  where om.module_id = m.id and m.key = 'remisiones';
update verticals set default_modules = default_modules - 'remisiones'
  where default_modules ? 'remisiones';
delete from modules where key = 'remisiones';

-- ROLLBACK: no reversible en esta migración; para reintroducir remisiones,
-- reaplicar los objetos definidos en 0012_f1_ventas.sql (tablas sales_notes/
-- sales_note_items/invoice_sales_notes, tipo sales_note_status, RPC
-- cobrar_remision, módulo 'remisiones' + RBAC + RLS).
