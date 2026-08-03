# FASE 7 — Ajustes de operación (fuente de verdad)

Paquete de ajustes sobre el ERP F0–F6. Convenciones vigentes.

## Puntos
1. **Compras = solo Órdenes de compra**: quitar la barra `ComprasNav` (Órdenes/Proveedores/CxP) de las páginas de compras; `/panel/compras` queda como lista + "Nueva orden" (dinámica de Pedidos). Proveedores→Maestros, CxP→Finanzas (ya en sidebar).
2. **Requisición ↔ OC**: FK real `purchase_orders.requisition_id`; se llena al convertir; se muestra en OC y en requisición.
3. **CxC como CxP**: `/panel/facturacion/cxc` con la misma dinámica que CxP — lista de cuentas por cobrar + **Registrar factura manual** + registrar pago + antigüedad.
4. **CRM (360 + prospectos)** y **Pagos (cobros/pagos consolidados)**: módulos activos hoy sin página → construir + agregar al menú.
5. **Configuración 100% funcional multitenant** (verificar).
6. **Folios**: administrables en Config→Folios para Cotización, Pedido, **Factura** (pasa a serie `FAC-A-0001`), **CxC** (=factura) y **CxP** (folio interno del proveedor). Etiquetas legibles.

## C1 · BD (AGENTE-DB · migración 0022_f7_ajustes.sql)
- `alter table purchase_orders add column if not exists requisition_id uuid references requisitions(id);`
- `create type prospect_stage as enum ('nuevo','contactado','propuesta','ganado','perdido');`
- `create table crm_prospects (id uuid pk default gen_random_uuid(), organization_id uuid not null references organizations(id), name text not null, contact_name text, phone text, email text, source text, stage prospect_stage not null default 'nuevo', notas text, customer_id uuid references customers(id), created_by uuid references profiles(id), created_at timestamptz default now(), updated_at timestamptz default now());` + trigger touch. RLS por operación módulo **`crm`**.
- `alter table supplier_invoices add column if not exists internal_folio text;` (folio interno consecutivo de CxP; el `folio` sigue siendo el del proveedor).
- **next_serie_folio v5**: asegurar CASE con `'invoice'→'FAC'` y agregar `'supplier_invoice'→'FP'` (conservar todos los previos). Seed `org_series` para orgs existentes de: quote/order/invoice/purchase/requisition/entry/count/transfer/supplier_invoice (on conflict do nothing).
- Bloque grants base; `-- ROLLBACK:`. (No se tocan RPCs de pago existentes.)
- pgTAP: FK requisition→OC; RLS crm_prospects (sin módulo crm → 42501); internal_folio de supplier_invoice.

## C2 · Tipos (ORQUESTADOR)
`src/lib/types/erp-crm.ts`: `ProspectRow/Input`, `ProspectStage`, `CustomerHistory` (cotizaciones/pedidos/facturas + saldo). `FolioDocType` += 'supplier_invoice'. Extender erp-compras si hace falta (requisitionId en PurchaseOrderRow/Detail).

## C3 · Mini-tanda (ORQUESTADOR)
- Nav: agregar **CRM** (`/panel/crm`) y **Pagos** (`/panel/pagos`) a Operación.
- **Factura → serie**: cambiar `invoices` POST y `conversions.ts` (createInvoice) a `nextSerieFolio(supabase, orgId, 'invoice')` (FAC), en vez de `next_folio`. CxC manual usará lo mismo.

## C4 · Tanda B (3 agentes ∥)
- **AGENTE-CRM** (`crm`): `src/app/api/erp/prospects/**` (CRUD + cambio de etapa + convertir a cliente) y `src/app/api/erp/crm/**` (GET `customers/[id]/history` = cotizaciones+pedidos+facturas+saldo) + `src/app/panel/crm/**` (pestañas **Clientes 360** y **Prospectos**).
- **AGENTE-PAGOS** (`pagos`): `src/app/api/erp/payments/**` (GET consolidado: cobros = invoice_payments [+cliente/folio], pagos = supplier_invoice_payments [+proveedor/folio]; filtros fecha/dirección/forma; totales) + `src/app/panel/pagos/**` (tablero cobros/pagos con totales).
- **AGENTE-CXC** (`facturacion`): `src/app/api/erp/receivables/**` (GET lista de facturas por cobrar; POST **registrar factura manual** [crea invoice status 'timbrada', saldo=total, folio `nextSerieFolio('invoice')`]; POST `[id]/pago` [rpc registrar_pago_factura]; GET `aging` CxC) + reconstruir `src/app/panel/facturacion/cxc/**` con la dinámica de CxP (lista + registrar factura + pago + antigüedad). NO edita `invoices/**` de AGENTE-FACTURACION.

## C5 · Tanda C (ORQUESTADOR)
- Quitar `ComprasNav` de `compras/page.tsx`, `compras/[id]/page.tsx`, `compras/requisiciones/*`, `compras/cxp/*` (dejar solo enlaces "Volver" simples). `/panel/compras` como lista limpia.
- Requisición↔OC: en `convertir` setear `requisition_id`; mostrar el link en OC detalle y requisición detalle (reemplaza el hack de notas).
- Config Folios: etiquetas legibles + lista canónica de doc types (Cotización/Pedido/Factura/OC/Requisición/Orden de entrada/Conteo/Traspaso/CxP), creando la serie al editar si no existe.
- Verificar Configuración multitenant (permisos/módulos/folios/branding/campos por-tenant).
- QA e2e + commits.

## C6 · Aceptación
- [ ] Compras muestra solo OC (lista + Nueva orden), sin barra Órdenes/Proveedores/CxP.
- [ ] Convertir requisición liga la OC (FK) y se ve en ambos.
- [ ] CxC permite registrar factura manual + pagos + antigüedad (igual que CxP).
- [ ] CRM: 360 del cliente (historial+saldo) y tablero de prospectos con etapas. Pagos: cobros y pagos consolidados con totales.
- [ ] Config administra folios de cotización/pedido/factura/cxc/cxp por-tenant; factura emite `FAC-A-####`.
- [ ] `tsc`/`lint`/`build`/`supabase test db` verdes; sin regresiones.
