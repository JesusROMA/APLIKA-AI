-- ============================================================================
-- Aplika.ai — 0020 · FASE 6 Requisiciones y Órdenes de Entrada · Enums (C1)
-- Migración AISLADA a propósito (mismo criterio que 0011/0015/0018): declara los
-- tipos enum ANTES de que 0021 los referencie en columnas/DEFAULT, de modo que
-- ya estén committeados. DO/EXCEPTION ⇒ idempotente (no hay
-- `create type if not exists`).
--   · requisition_status : ciclo de una requisición de compra.
--   · entry_order_status : ciclo de una orden de entrada de inventario.
-- ============================================================================

do $$ begin
  create type requisition_status as enum
    ('borrador','aprobada','rechazada','convertida','cancelada');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type entry_order_status as enum
    ('borrador','aplicada','cancelada');
exception when duplicate_object then null;
end $$;

-- ============================================================================
-- ROLLBACK: (documentación, no ejecutable)
-- drop type if exists entry_order_status;
-- drop type if exists requisition_status;
-- ============================================================================
