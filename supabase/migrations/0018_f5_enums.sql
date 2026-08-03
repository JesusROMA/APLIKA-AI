-- ============================================================================
-- Aplika.ai — 0018 · FASE 5 Compras y Proveedores · Enums (contrato C1.0)
-- Migración AISLADA a propósito (mismo criterio que 0011/0015): declara los
-- tipos enum ANTES de que 0019 los referencie en columnas/DEFAULT, de modo que
-- ya estén committeados. DO/EXCEPTION ⇒ idempotente (no hay
-- `create type if not exists`).
--   · purchase_order_status  : ciclo de una orden de compra (OC).
--   · supplier_invoice_status: ciclo de una factura de proveedor (CxP).
-- ============================================================================

do $$ begin
  create type purchase_order_status as enum
    ('borrador','confirmada','recibida_parcial','recibida','cancelada');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type supplier_invoice_status as enum
    ('borrador','registrada','pagada','pago_parcial','cancelada');
exception when duplicate_object then null;
end $$;

-- ============================================================================
-- ROLLBACK: (documentación, no ejecutable)
-- drop type if exists supplier_invoice_status;
-- drop type if exists purchase_order_status;
-- ============================================================================
