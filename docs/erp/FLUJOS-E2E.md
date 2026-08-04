# Aplika ERP · Flujos End-to-End de la operación

> Documento de referencia funcional (estilo Oracle Cloud Business Process
> Flows). Describe cómo fluye cada proceso de punta a punta: qué maestro lo
> alimenta, qué documentos lo componen, qué estados atraviesa, qué asienta en
> inventario/finanzas, quién puede hacer qué y cómo se rastrea. Es la fuente de
> verdad funcional; los contratos técnicos por fase viven en `F*-CONTRATOS.md`.

---

## 0 · Principios del sistema

1. **Los Maestros alimentan toda la operación.** Nada se opera sobre texto
   libre cuando existe un maestro: Clientes, Proveedores, Productos/Variantes,
   Almacenes y Listas de precios son el origen único de datos.
2. **Todo documento tiene folio por serie** (`org_series`, configurable por
   tenant en Configuración → Folios): COT, PED, FAC, REQ, OC, OE, CONT, TRAS, FP.
3. **Todo movimiento de dinero y mercancía queda trazado**: los documentos de
   venta se ligan por `document_links` (cadena navegable); los de compra por FKs
   (requisición→OC→orden de entrada→factura de proveedor); el inventario por
   kardex (`inventory_movements` con `ref_type/ref_id`).
4. **El inventario tiene un solo camino de entrada** (Orden de Entrada aplicada)
   y sale por Ventas o por movimiento manual (salida/ajuste). Todo al **costo
   promedio ponderado por (variante, almacén)**.
5. **Los totales siempre se calculan en el servidor** (misma fórmula en todo el
   flujo: partida → descuento → IVA → total).
6. **La seguridad es de datos, no de pantalla**: RBAC por acción + RLS por
   operación en BD. La UI solo refleja. Todo evento relevante queda en la
   Bitácora (`audit_log`).
7. **Multitenant**: cada organización tiene sus módulos, permisos, folios,
   branding y campos personalizados propios.

### Roles (por tenant)
| Rol | Alcance |
|---|---|
| Dueño (`tenant_admin`) | Todo, incl. configurar, cancelar y ver bitácora |
| Operador (`tenant_user`) | Ver/crear/editar (no cancela, no configura) |
| Solo lectura (`tenant_viewer`) | Solo consulta |

---

## 1 · QUOTE-TO-CASH — De la Cotización al Cobro (Ventas)

**Maestros que lo alimentan:** Cliente (con su lista de precios y datos SAT),
Productos/Variantes (precio base + IVA), Almacén (origen del stock), Lista de
precios (precio pactado).

```
[Cliente + Lista + Almacén]
        │
   COTIZACIÓN (COT-A-####)          borrador → enviada → aceptada | rechazada | vencida
        │  · selecciona LISTA DE PRECIOS (default: la del cliente)
        │  · selecciona ALMACÉN (default: el del tenant)
        │  · partidas con precio resuelto de la lista + descuento por línea/global
        │  · enviar = correo al cliente (EmailProvider)
        ▼  convertir (aceptada)
   PEDIDO (PED-A-####)              borrador → confirmado → pagado → surtido(parcial) → facturado → enviado
        │  · hereda cliente, almacén y partidas de la cotización
        │  · al llegar a "pagado": SALIDA de inventario del ALMACÉN del pedido,
        │    al costo promedio (COGS) — kardex ref 'order'
        │  · entregas parciales por partida (qty_delivered)
        ▼  convertir
   FACTURA (FAC-A-####)             borrador → timbrada → pago_parcial → pagada | cancelada
        │  · totales copiados del pedido (números idénticos en el flujo)
        │  · timbrado CFDI (PAC; hoy stub) · PUE/PPD
        ▼
   COBRO (CxC)
        · pagos parciales/total (registrar_pago_factura)
        · PPD ⇒ cada pago genera REP (complemento de pago)
        · saldo vivo en Finanzas → Cuentas por Cobrar (antigüedad 0-30/31-60/61-90/90+)
        · el pago aparece en Operación → Pagos (dinero que entra)
```

**Variante corta:** venta directa = Pedido sin cotización, o Factura manual
directa en CxC (cliente + partidas → factura timbrada con saldo).

**Trazabilidad:** cadena `document_links` navegable en ambos sentidos desde
cualquier documento (bloque "Cadena documental"); cliente 360 en CRM muestra
todas sus cotizaciones/pedidos/facturas + saldo.

**Reglas de negocio clave**
- Solo se convierte a pedido una cotización **aceptada** (y solo una vez).
- El pedido descuenta stock **una sola vez** (candado `stock_applied`) del
  **almacén del documento**.
- Cancelar nunca borra: estado `cancelada` + bitácora.
- La factura sólo admite pagos en `timbrada`/`pago_parcial`.

---

## 2 · PROCURE-TO-PAY — De la Compra al Pago (Compras)

**Maestros:** Proveedor (días de crédito, saldo CxP), Productos/Variantes,
Almacén (destino de la mercancía).

```
[Proveedor + Producto + Almacén]
        │
   REQUISICIÓN (REQ-A-####)         borrador → aprobada → convertida | rechazada | cancelada
        │  · solicitud interna con costo estimado
        ▼  convertir (elige proveedor)
   ORDEN DE COMPRA (OC-A-####)      borrador → confirmada → recibida_parcial → recibida | cancelada
        │  · ligada a su requisición (FK, visible en ambos)
        │  · almacén de destino; costo pactado por partida
        ▼  generar (confirmada)
   ORDEN DE ENTRADA (OE-A-####)     borrador → aplicada | cancelada
        │  · ÚNICO camino de entrada de inventario
        │  · el operador APLICA: ENTRADA al almacén al costo de la OC
        │    ⇒ actualiza el COSTO PROMEDIO ponderado (kardex ref 'entry')
        │  · actualiza qty_received y el estado de la OC
        ▼
   FACTURA DE PROVEEDOR (FP)        registrada → pago_parcial → pagada | cancelada
        │  · folio del proveedor + folio interno; ligada a la OC
        │  · al registrarla SUBE el saldo del proveedor (CxP)
        ▼
   PAGO (CxP)
        · pagos parciales/total (registrar_pago_compra) ⇒ baja saldo y balance
        · Finanzas → Cuentas por Pagar (antigüedad) · Operación → Pagos (sale dinero)
```

**Variante corta:** OC directa sin requisición; Orden de entrada **manual**
(origen manual/ajuste/devolución) para stock inicial o devoluciones.

**Reglas clave**
- La OC solo se cancela sin recepciones.
- La entrada clampa a lo pendiente por partida (no se recibe de más).
- La factura de proveedor solo se cancela sin pagos (y revierte el CxP).

---

## 3 · INVENTARIO — Control y valuación

**Maestros:** Productos/Variantes (SKU, unidad SAT), Almacenes (multi-almacén).

| Proceso | Documento | Efecto |
|---|---|---|
| Entrada (compra/manual/devolución) | **Orden de Entrada** aplicada | +stock al costo → recalcula promedio |
| Salida por venta | Pedido al llegar a `pagado` | −stock al promedio (COGS) |
| Salida/merma manual | Movimiento manual (salida/ajuste) | −stock al promedio; entrada directa **bloqueada** |
| Conteo físico | **Conteo** (CONT) borrador → en_conteo → aplicado | ajustes solo por diferencias vs sistema |
| Traspaso entre almacenes | **Traspaso** (TRAS) borrador → en_tránsito → recibido | sale del origen y entra al destino **con su costo** |
| Valuación | Reporte | Σ stock × costo promedio, por almacén |
| Kardex | Por variante+almacén | cada movimiento con costo unitario, promedio y saldo corridos |

**Regla de oro:** el stock y el costo de cada almacén solo cambian por
documentos aplicados; el kardex explica cada unidad y cada peso.

---

## 4 · CITA-AL-COBRO — Servicios / Clínicas (vertical servicios_agenda)

**Maestros:** Pacientes (=Clientes), Profesionales (=Perfiles del staff).

```
   AGENDA         cita (anti-empalme por profesional, garantizado en BD)
     │            agendada → confirmada → completada | no_asistio | cancelada
     │            series recurrentes (semanal/quincenal/mensual) generan citas
     ▼
   EXPEDIENTE     nota clínica por sesión — confidencial (solo su autor + dueño)
     ▼
   COBRO          factura manual en CxC al paciente → pago → Pagos/CxC
```

---

## 5 · FINANZAS Y TRANSVERSALES

- **Cuentas por Cobrar**: facturas de cliente con saldo; registrar factura
  manual; pagos; antigüedad. **Cuentas por Pagar**: espejo con proveedores.
- **Pagos**: tablero consolidado de dinero que entra (cobros de facturas) y
  sale (pagos a proveedores), con totales y filtros.
- **Dashboard**: KPIs por módulo activo — ventas del mes, CxC, valor de
  inventario, citas de hoy, alertas de stock.
- **CRM**: cliente 360 (historial + saldo) y embudo de prospectos
  (nuevo→contactado→propuesta→ganado/perdido → convertir a cliente).
- **Configuración (por tenant)**: permisos por rol/acción, módulos on/off,
  folios por serie, branding (aparece en los PDF), campos personalizados.
- **Bitácora**: quién hizo qué y cuándo (solo dueño).

---

## 6 · Matriz de sincronización (qué alimenta a qué)

| Maestro / doc | Alimenta |
|---|---|
| Cliente | Cotización/Pedido/Factura (datos SAT, lista de precios), CRM 360, CxC |
| Proveedor | Requisición→OC, Factura de proveedor, CxP |
| Producto/Variante | Partidas de todos los documentos, inventario, kardex |
| Almacén | Cotización→Pedido (salida), OC→Orden de entrada (entrada), conteos, traspasos, valuación |
| Lista de precios | Precio de las partidas de venta (seleccionable en cotización; default la del cliente) |
| Pedido pagado | −Inventario (COGS) |
| Orden de entrada aplicada | +Inventario (costo promedio) + estado de la OC |
| Factura timbrada | CxC (+saldo) |
| Factura de proveedor registrada | CxP (+saldo proveedor) |
| Pagos (ambos sentidos) | CxC/CxP, tablero de Pagos |
