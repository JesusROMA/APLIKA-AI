# F3 · Tanda B — Brief compartido (Clínicas/Agenda)

> Común a AGENTE-AGENDA ∥ AGENTE-EXPEDIENTE. Vertical `servicios_agenda`.
> Pacientes = `customers`; profesionales = `profiles`.

## Reglas duras
- SOLO `~/APLIKA-AI`. NUNCA otros proyectos. NO git, NO migraciones, NO `db reset`.
- **PROHIBIDO editar** (compartido): `src/lib/**`, `supabase/**`, `src/app/panel/_components/**`, `src/app/panel/_lib/api.ts`/`ventas-api.ts`/`hooks.ts`, `panel.css`, `panel/layout.tsx`, `PanelShell`/`Sidebar`, y los archivos del OTRO agente. Si necesitas tocar algo compartido, DETENTE y repórtalo.
- Creas archivos NUEVOS en tu subárbol + un cliente `src/app/panel/_lib/<area>.ts`.

## Superficie compartida (plantillas: `src/app/api/erp/quotes/route.ts` backend, `src/app/panel/pedidos/[id]/page.tsx` UI)
- **Tipos**: `@/lib/types/erp-clinica` (`AppointmentRow/AppointmentDetail/AppointmentInput`, `AppointmentStatus`, `AppointmentFreq`, `SeriesRow/SeriesInput`, `ClinicalNoteRow/ClinicalNoteInput`, `ProfessionalRef`) y `@/lib/types/erp` (`SessionInfo`,`Paginated`,`ListParams`).
- **Backend**: `@/lib/api` (`handle`,`ok`,`ApiError`); `@/lib/erp/session` (`getErpSession`); `@/lib/erp/guards` (`requireAccess`); `@/lib/erp/db` (`erpClientFor`); `@/lib/erp/pagination`; `@/lib/erp/clinica` (`fetchProfessionals(supabase, orgId)`); `@/lib/supabase/database.types`.
- **RPC**: `supabase.rpc('generar_serie', { p_series })` → nº de citas creadas (valida `has_perm('calendario','crear')`, omite empalmes).
- **Anti-empalme**: al INSERT/UPDATE de `appointments`, un traslape del mismo profesional lanza Postgres `23P01` (exclusion_violation). CÁPTURALO y devuelve **409** "Empalme: el profesional ya tiene una cita en ese horario".
- **Panel**: `@/app/panel/_components/CustomerPicker` (paciente), `DataTable`, `Drawer`, `Field`, `States`, `Icon`; `@/app/panel/_lib/hooks`; `@/app/panel/_components/session` (`useSession`,`useCan`); `listCustomers` de `@/app/panel/_lib/api`. Rutas `/panel/agenda` y `/panel/expediente` ya en el Sidebar.

## Convenciones
- Route: `export const dynamic='force-dynamic'`; `handle`; `requireAccess(session, '<modulo>', accion)`; zod; listados paginados/por rango; filas camelCase; fechas ISO (timestamptz).
- `appointments` módulo **`calendario`**; `clinical_notes` módulo **`expediente`**.
- Estados de cita: agendada→confirmada→completada, o cancelada, o no_asistio (PATCH status con `requireAccess('calendario','editar')`; cancelar con `'cancelar'`).
- `weekday`: 0=domingo … 6=sábado.
- UI `'use client'`; permisos `useCan()`; moneda `Intl.NumberFormat('es-MX',...)`; cliente fetch en `src/app/panel/_lib/<area>.ts`.

## Verificación (cada agente): `npx tsc --noEmit` y `npm run lint` limpios. Reporta archivos, endpoints y resultados. Si una firma no calza, ajústate; no modifiques lo compartido.
