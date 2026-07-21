-- ============================================================================
-- Aplika.ai — 0011 · FASE 1 Ventas · Cambios de ENUM (contrato C1.0)
-- Regla PostgreSQL: `ALTER TYPE ... ADD VALUE` debe ir en su PROPIA transacción
-- y NO puede usarse el valor nuevo en la misma tx. Por eso este archivo SOLO
-- agrega valores / crea tipos nuevos; todo el uso (columnas, RPCs) vive en
-- 0012_f1_ventas.sql (migración/transacción separada).
-- Requiere 0010_f0_fundaciones.sql.
-- ============================================================================

-- order_status += 'surtido_parcial' (entregas parciales de logística).
alter type order_status  add value if not exists 'surtido_parcial';

-- invoice_status += 'pagada','pago_parcial' (CxC / complemento de pago).
alter type invoice_status add value if not exists 'pagada';
alter type invoice_status add value if not exists 'pago_parcial';

-- Nuevos enums de documentos de venta. DO/EXCEPTION => idempotente (no existe
-- `create type if not exists` en PostgreSQL).
do $$ begin
  create type quote_status as enum ('borrador','enviada','aceptada','rechazada','vencida');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type sales_note_status as enum ('abierta','cobrada','facturada','cancelada');
exception when duplicate_object then null;
end $$;

-- ============================================================================
-- ROLLBACK: (documentación, no ejecutable)
-- PostgreSQL NO permite eliminar un value de un enum existente. El rollback real
-- de un ADD VALUE es RECREAR el tipo desde cero: crear un enum nuevo con el
-- conjunto viejo de valores, migrar todas las columnas que lo usan
-- (order_status: orders.status; invoice_status: invoices.status) con USING,
-- soltar el tipo viejo y renombrar — operación destructiva que exige que ninguna
-- fila use los valores 'surtido_parcial'/'pagada'/'pago_parcial'.
--
-- Los tipos nuevos sí se pueden soltar (tras soltar sus columnas en 0012):
-- drop type if exists sales_note_status;
-- drop type if exists quote_status;
-- ============================================================================
