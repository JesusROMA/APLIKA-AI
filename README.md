# Aplika.ai — ERP ligero multi-tenant (mayoreo)

Backend full-stack (Next.js + Supabase + Stripe + CFDI 4.0) para el frontend
Claude Design ya construido. SaaS multi-tenant: Aplika.ai es el proveedor; cada
cliente es una empresa (refaccionarias, ferreterías, autopartes, distribuidoras)
con su propio backoffice. Una sola base de datos, aislamiento por `organization_id`
+ RLS.

> **Regla #0 — Aislamiento de Reservi.** Este proyecto es 100% independiente.
> Repo git, Supabase, Stripe y `.env` **nuevos y exclusivos de Aplika**. No
> reutiliza credenciales ni datos de ningún otro proyecto. Variables sensibles con
> prefijo `APLIKA_`.

## Stack

- **Next.js 14** (App Router, TypeScript, Route Handlers) — `output: standalone`.
- **Supabase** (Postgres + Auth + Storage) — RLS en todas las tablas.
- **Stripe** (Checkout + webhook firmado) — modelo estándar, arquitectura lista
  para Connect (`APLIKA_STRIPE_CONNECT_ENABLED`).
- **CFDI 4.0** — adaptador `PacProvider` desacoplado con **stub mockeable**
  (Facturama/Finkok/SW se enchufan implementando la misma interfaz).
- **Deploy**: VPS IONOS con Docker (`next start`).

## Decisiones confirmadas

| Tema | Decisión |
|---|---|
| Cobro | **Stripe estándar** (cuenta única Aplika); arquitectura lista para Connect |
| Almacenes | **Multi-almacén** por tenant |
| PAC CFDI | **Stub** mockeable ahora; PAC real después |
| Frontend | **Servir `.dc.html` + inyectar `fetch`** (visual intacto) |

## Estructura

```
APLIKA/
├─ src/
│  ├─ app/api/…            # Route Handlers (contrato /api/*)
│  ├─ lib/                 # env, supabase, auth, tenant, format, stripe, pac, modules
│  └─ middleware.ts        # refresco de sesión Supabase
├─ public/dc/             # frontend Claude Design (coloca aquí el .zip) + aplika-api.js
├─ supabase/
│  ├─ migrations/         # 0001 esquema · 0002 RLS · 0003 lógica · 0004 storage
│  ├─ seed.sql            # demo "Refaccionaria del Norte"
│  └─ tests/              # pgTAP (RLS + inventario)
├─ tests/                 # vitest (pipeline, formato)
├─ Dockerfile · docker-compose.yml · .env.example
└─ INTEGRACION-FRONTEND.md
```

## Puesta en marcha (local)

1. **Supabase nuevo**: crea un proyecto en supabase.com (cuenta de Aplika).
2. Copia envs: `cp .env.example .env.local` y rellena con TUS valores.
3. Instala y migra:
   ```bash
   npm install
   supabase link --project-ref <tu-ref>      # o usa supabase local
   supabase db push                          # aplica migraciones 0001..0004
   psql "$APLIKA_SUPABASE_DB_URL" -f supabase/seed.sql   # datos demo
   ```
4. Coloca el frontend en `public/dc/` (ver `public/dc/README.md`) y cablea datos
   siguiendo `INTEGRACION-FRONTEND.md`.
5. `npm run dev` → http://localhost:3000

**Usuarios demo** (password `Aplika2026!`):
- Super-admin: `admin@aplika.ai`
- Tenant admin (Refaccionaria del Norte): `juan@refanorte.mx`

## Sincronización automática del equipo

Para que los commits fluyan solos entre el equipo (sin pedir pull/push manual):

1. **Activa el auto-push (una sola vez por desarrollador):**
   ```bash
   git config core.hooksPath .githooks
   ```
   A partir de ahí, **cada `git commit` se sube solo** a `origin/main`; si el
   remoto va adelante, integra con `pull --rebase --autostash` y reintenta.
2. **VS Code** ya queda configurado por `.vscode/settings.json`: auto-fetch cada
   60 s (verás la flecha ↓ con los commits entrantes) y Sync con rebase+autostash.
3. **Auto-pull continuo (opcional):** en una terminal aparte corre
   `npm run sync` (Windows) o `./scripts/auto-sync.sh` (macOS/Linux) — baja los
   commits del equipo cada 60 s mientras trabajas, preservando tus cambios.

## Contrato de API (implementado)

Auth: `POST /api/auth/login`, `/logout`.
Dashboard: `GET /api/dashboard/kpis`, `/sales-trend`.
Pedidos: `GET/POST /api/orders`, `GET /api/orders/{id}/items`, `POST /api/orders/{id}/transition`.
Inventario: `GET /api/inventory/{products,summary,alerts,warehouses}`, `GET /api/inventory/{sku}/kardex`, `POST /api/inventory/adjust`.
Facturación: `GET /api/invoices`, `/summary`, `POST /api/invoices/{id}/timbrar`, `/cancelar`.
Pagos: `GET /api/payments`, `/summary`, `/revenue`, `POST /api/payments/checkout`, `POST /api/webhooks/stripe`.
CRM: `GET/POST /api/customers`, `GET/PATCH /api/customers/{id}`.
Agente IA: `GET /api/ai-agent/{summary,metrics,conversations}`.
Leads: `POST /api/leads`.
Super-admin: `GET /api/admin/{metrics,tenants,plans,health,incidents}`, `POST /api/admin/tenants/{id}/impersonate`, `PATCH /api/admin/tenants/{id}/status`.

## Lógica de negocio

- **Order-to-Cash**: al pasar a `pagado`/`surtido` se decrementa inventario de
  forma **atómica** y se registra en kardex (`transition_order` → `apply_order_stock`
  → `adjust_inventory`). Idempotente vía `orders.stock_applied`.
- **Backorder configurable** por tenant (`organizations.allow_backorder`).
- **El estado de pago lo decide el webhook firmado de Stripe**, nunca el cliente.
- **CFDI**: `factura (borrador) → timbrar → UUID + XML en Storage → cancelar`.
- **RLS**: cada fila se filtra por `organization_id` derivado del JWT; `super_admin`
  ve todo; rol `customer` (storefront) restringido a sus propios datos.

## Seguridad

- RLS activado en todas las tablas (`0002_rls_policies.sql`).
- Webhook de Stripe con **verificación de firma** (`APLIKA_STRIPE_WEBHOOK_SECRET`).
- Montos calculados en servidor; nunca se confía en el cliente.
- Service role solo en servidor; el frontend solo muestra `sk_live_••••`.
- Leads: honeypot + rate limiting + validación Zod.

## Despliegue en VPS IONOS (Docker)

1. Instala Docker + Docker Compose en el VPS.
2. Sube el repo y crea `.env` (producción) a partir de `.env.example`.
3. Build & run:
   ```bash
   docker compose up -d --build
   ```
   La app queda en el puerto `3000` (healthcheck en `/api/health`).
4. **Reverse proxy** (Nginx/Caddy) con TLS hacia `127.0.0.1:3000`. Apunta el
   dominio raíz (`APLIKA_ROOT_DOMAIN`) y **wildcard** `*.aplika.shop` para los
   subdominios de tenant (storefront por subdominio).
5. **Webhook de Stripe**: en el dashboard de Stripe, endpoint
   `https://tu-dominio/api/webhooks/stripe`, eventos
   `checkout.session.completed`, `payment_intent.succeeded`,
   `payment_intent.payment_failed`, `charge.refunded`. Copia el `whsec_…` a
   `APLIKA_STRIPE_WEBHOOK_SECRET`.
6. **Supabase**: usa el proyecto cloud de Aplika (no self-host). Las migraciones
   se aplican con `supabase db push` desde tu máquina o CI.
7. **Storage**: el bucket `cfdi` (privado) y `branding` (público) se crean con la
   migración `0004_storage.sql`.

## Tests

```bash
npm test                 # vitest: pipeline de pedidos + formato
supabase test db         # pgTAP: RLS + decremento de inventario + backorder
```

## Pendiente / siguiente iteración

- Impersonación de super-admin: hoy **auditada** (bitácora). El cambio de sesión
  efectivo con datos del tenant se hará con scoping explícito por `organization_id`
  (sin desactivar el bypass RLS de super_admin).
- Notificación de leads por correo (stub `APLIKA_SMTP_URL`).
- Integrar un PAC real implementando `PacProvider`.
- Webhooks/captura de pedidos del Agente IA (entrada de mensajes).
