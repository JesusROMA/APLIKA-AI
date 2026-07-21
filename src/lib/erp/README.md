# `src/lib/erp` — núcleo del ERP (FASE 0, AGENTE-BACKEND)

Helpers y guards del namespace `/api/erp/*`. Fuente de verdad: `docs/erp/F0-CONTRATOS.md`.

## Piezas

- `db.ts` — `getErpClient()` / `erpClientFor(session)`: cliente Supabase tipado
  (`<Database>`) que reusa el factory compartido y aplica el header de
  impersonación. El factory compartido `createSupabaseServerClient` se dejó SIN
  el genérico para no re-tipar (ni arriesgar) los endpoints del panel dc.
- `impersonation.ts` — cookie httpOnly **firmada** (HMAC) `aplika_impersonate`
  (C1.3). Firma con la service-role key para no requerir una env nueva.
- `session.ts` — `getErpSession()` → `SessionInfo` (identidad + org efectiva +
  módulos activos + `PermissionMap`). Base de `/api/erp/me` y de los guards.
- `guards.ts` — `requireModule`, `requirePerm`, `requireAccess`,
  `buildPermissionMap`. 403 limpio antes de pegarle a la BD (la RLS lo refuerza).
- `pagination.ts` — `listParamsSchema`, `parseListParams`, `rangeFor`,
  `paginated` (respuesta `Paginated<T>`).
- `catalogs.ts` — lectura de catálogos SAT + set de codes para validar inputs.
- `products.ts` — mapeo `RawProduct → ProductRow` + `stockByVariant`.
- `pricing.ts` — `resolveVariantPrice()` (ver abajo).

## Desviaciones del contrato C3 (reportadas al orquestador)

1. **Precio-desde-lista como helper, no en `/api/orders`.** El contrato C1.6/C3
   pide que el POST de pedidos resuelva el precio (item de la lista del cliente →
   `base_price_mxn`). En F0 `/api/orders` pertenece al panel dc y NO se toca para
   no romperlo. La lógica queda lista en `resolveVariantPrice(supabase,
   variantId, customerId)` para que **F1** la consuma en el nuevo
   `/api/erp/orders`.

2. **`customers.active` no existe.** `CustomerRow.active` y el `PATCH … active`
   están en el contrato, pero la migración `0010` no agregó la columna. El GET
   expone `active: true` fijo y el PATCH acepta `active` pero es **NO-OP**. Para
   que el soft-inactivar funcione, AGENTE-DB debe agregar `customers.active
   boolean not null default true` (+ política/uso). Reportado.

3. **`PUT price-lists/[id]/items` = UPSERT, no replace por delete.** La RLS de
   C1.2 restringe `DELETE` a super_admin en todas las tablas operativas
   (incluidas las de maestros). No es posible "borrar todo y reinsertar" con el
   cliente del tenant. Se implementa como **upsert masivo** por la unique
   `(price_list_id, product_variant_id)`: agrega/actualiza los items enviados;
   los omitidos conservan su precio. Para un replace real (borrar omitidos) se
   necesitaría un RPC `SECURITY DEFINER` o relajar la política de DELETE.

4. **`requireTenant` + impersonación.** `auth.ts` ahora acepta a un super_admin
   con cookie de impersonación válida (devuelve la org impersonada). Se agregó
   `'tenant_viewer'` a `UserRole` para calzar con el enum de la BD.

5. **`/api/erp/me` refleja `impersonating`.** El contrato menciona además que
   `/api/auth/me` lo refleje; ese archivo es del panel dc y está fuera de la
   propiedad de AGENTE-BACKEND, así que no se tocó. El estado de impersonación
   se expone en `/api/erp/me`.
