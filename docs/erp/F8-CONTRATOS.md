# FASE 8 — Sincronización E2E (fuente de verdad)

> Cierra los huecos para que `FLUJOS-E2E.md` sea 100% cierto en el producto.
> Huecos verificados: la cotización no tiene almacén ni lista de precios; la
> conversión cotización→pedido no propaga almacén; el buscador de variantes no
> admite lista/almacén; la factura de proveedor no se prellena desde la OC.

## Alcance
1. **Cotización con almacén y lista de precios** (selección explícita):
   - BD (`0024_f8_sync.sql`): `quotes.warehouse_id uuid references warehouses`,
     `quotes.price_list_id uuid references price_lists` (additivas).
   - API quotes (POST/PATCH/GET): acepta y persiste `warehouseId`/`priceListId`;
     el precio de las partidas se resuelve con la lista **seleccionada**
     (fallback: lista del cliente → precio base).
   - UI cotización: selector de **Lista de precios** (default: la del cliente al
     elegirlo) y de **Almacén** (default: el predeterminado del tenant).
2. **Precios por lista explícita**:
   - `resolveVariantPrice(supabase, variantId, customerId?, priceListId?)` — si
     viene `priceListId`, esa lista manda.
   - `buildLines(supabase, customerId, inputs, priceListId?)`.
   - `GET /api/erp/variants?search&customerId&priceListId&warehouseId` — precio
     resuelto por la lista indicada y `stockTotal` acotado al almacén indicado
     (si se pasa), para ver disponibilidad real del almacén al cotizar.
   - `DocLinesEditor`/`ProductPicker`: props `priceListId?`/`warehouseId?` que
     fluyen al buscador.
3. **Conversión conectada por almacén**: `convertQuoteToOrder` copia
   `warehouse_id` de la cotización al pedido (la salida de stock ocurre en ese
   almacén). Pedido directo mantiene su selector (default del tenant).
4. **Compra→pago sin recaptura**: en la OC (recibida/parcial) botón **“Registrar
   factura de proveedor”** → `/panel/compras/cxp/nueva?poId=` prellenando
   proveedor, OC ligada y partidas/totales desde la OC (editables).
5. **QA**: e2e Q2C con lista+almacén seleccionados (precio de lista correcto,
   stock sale del almacén elegido) y P2P con prellenado desde OC.

## Propiedad
Ajuste compacto: lo ejecuta el ORQUESTADOR directamente (migración 0024 mínima
tipo 0023 + ediciones puntuales en piezas propias: `pricing.ts`, `documents.ts`,
`variants/route.ts`, `conversions.ts`, quotes API/Form [de F1], `DocLinesEditor`,
CxP nueva [prefill] y PO detalle [botón]). pgTAP no requiere cambios de RLS; el
QA es e2e HTTP + typecheck/lint/build + regresión `supabase test db`.

## Aceptación (verificada 2026-09-07, QA e2e HTTP contra Supabase local)
- [x] Cotizar con lista "Mayoreo B" pone los precios de esa lista aunque el
      cliente tenga otra; sin selección usa la del cliente; sin lista, el base.
      (COT-A-0003: BAL-1184 a $360 de lista B, no $100 del cliente ni $420 base;
      COT-A-0002: BAL-S220 sin lista cayó al base $380.)
- [x] El picker muestra el stock del almacén elegido (`/variants?warehouseId`:
      BAL-S220 58 pzas en Bodega 2, BAL-1184 0 ahí y 6 en Matriz).
- [x] Cotización aceptada → pedido hereda el almacén; al pagar, el stock sale de
      ese almacén (PED-A-0002 heredó Matriz; kardex: salida -2 ref order,
      stock 6→4).
- [x] Desde una OC recibida se registra la factura de proveedor prellenada
      (proveedor+partidas+OC ligada) y el CxP sube (REQ-A-0001→OC-A-0002
      recibida con avg cost 107.1429; factura PROV-QA-001 ligada, saldo 1740→0
      al pagar).
- [x] `tsc`/`build`/`vitest 15/15`/`supabase test db 116/116` verdes; sin
      regresiones.
