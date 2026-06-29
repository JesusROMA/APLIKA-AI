# Integración del frontend Claude Design con el backend

> Objetivo: conectar datos reales **sin tocar el diseño**. Cada pantalla ya trae
> sus arreglos mock dentro de `class Component`. Solo los reemplazamos por
> llamadas a `window.AplikaAPI` (ver `public/dc/aplika-api.js`) y forzamos un
> re-render. El HTML/estilos y las plantillas `{{ }}` quedan **idénticas**.

## Paso 0 — cargar el cliente API

En cada `.dc.html` que consuma datos, añade **después** de `support.js`:

```html
<script src="./support.js"></script>
<script src="./aplika-api.js"></script>
```

El patrón general en cada `class Component`:

```js
componentDidMount() {
  // ...lo que ya hubiera...
  this.cargarDatos();
}
async cargarDatos() {
  try {
    const r = await window.AplikaAPI.metodo();
    this.<campoMock> = r.<campo>;   // misma forma que el arreglo mock
    this.forceUpdate();             // re-render; renderVals() vuelve a correr
  } catch (e) { console.error(e); }
}
```

Como las formas del backend **coinciden** con los arreglos mock, no hay que tocar
`renderVals()` ni las plantillas.

---

## Login.dc.html

Reemplaza el stub `submit()`:

```js
async submit(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (!this.state.email.trim() || !this.state.password.trim()) {
    this.setState({ error: 'Escribe tu correo y contraseña.' }); return;
  }
  this.setState({ error: '', loading: true });
  try {
    const r = await window.AplikaAPI.login(this.state.email, this.state.password);
    window.location.href = r.redirect;            // panel según rol
  } catch (err) {
    this.setState({ error: 'Correo o contraseña incorrectos.', loading: false });
  }
}
```

## Contacto.dc.html y Agenda-demo.dc.html (leads)

Reemplaza el `setTimeout` del stub por:

```js
// Contacto: { name, business, contact, message }
// Agenda-demo: añade industry, size y source 'agenda_demo'
try {
  await window.AplikaAPI.lead({
    name: this.state.name, business: this.state.business,
    contact: this.state.contact, message: this.state.message || '',
    industry: this.state.industry, size: this.state.size,
    source: 'contacto' /* o 'agenda_demo' */,
    website: ''  // honeypot (déjalo vacío; añade un input oculto si quieres)
  });
  this.setState({ formState: 'success' });
} catch (e) { this.setState({ formState: 'error', errors: { contact: 'Inténtalo de nuevo' } }); }
```

## Panel Cliente.dc.html

Añade en `componentDidMount()` una carga por módulo (puedes cargar todo al inicio
o al cambiar de vista). Mapeo campo mock → API:

| Campo mock (this.) | Llamada | Asignación |
|---|---|---|
| `kpis` | `AplikaAPI.kpis()` | `this.kpis = r.kpis` |
| `ventas` | `AplikaAPI.orders('todos')` | `this.ventas = r.orders` |
| `ordersData` (recientes) | `AplikaAPI.orders('', '', 6)` | `this.ordersData = r.orders` |
| `productos` | `AplikaAPI.inventory('todos')` | `this.productos = r.products` |
| `alerts` | `AplikaAPI.inventoryAlerts()` | `this.alerts = r.alerts` |
| `facturas` | `AplikaAPI.invoices('todas')` | `this.facturas = r.invoices` |
| `pagos` | `AplikaAPI.payments()` | `this.pagos = r.payments` |
| `clientes` | `AplikaAPI.customers()` | `this.clientes = r.clientes` |
| `iaConvs` | `AplikaAPI.aiConversations()` | `this.iaConvs = r.conversations` |

Ejemplo:

```js
async cargarTenant() {
  const [kpis, ventas, prod, fac, pagos, cli, ia] = await Promise.all([
    window.AplikaAPI.kpis(), window.AplikaAPI.orders('todos'),
    window.AplikaAPI.inventory('todos'), window.AplikaAPI.invoices('todas'),
    window.AplikaAPI.payments(), window.AplikaAPI.customers(),
    window.AplikaAPI.aiConversations(),
  ]);
  this.kpis = kpis.kpis; this.ventas = ventas.orders; this.productos = prod.products;
  this.facturas = fac.invoices; this.pagos = pagos.payments;
  this.clientes = cli.clientes; this.iaConvs = ia.conversations;
  this.forceUpdate();
}
```

**Detalle de pedido** (drawer): al abrir, `AplikaAPI.orderItems(folio)` →
sustituye `this.detailLines` por `r.lines`.
**Drawer de producto + kardex**: `AplikaAPI.kardex(sku)` → `this.kardex = r.kardex`
y usa `r.product.almacenes` para "Stock por almacén".
**Transiciones** (botón "Confirmar/Registrar pago/…"): `AplikaAPI.transitionOrder(folio, nuevoEstado)`.
**Timbrar / cancelar**: `AplikaAPI.timbrar(factura.id)` / `AplikaAPI.cancelarFactura(factura.id)`
(por eso el API devuelve `id` en cada factura).
**Ajuste de stock**: `AplikaAPI.adjustInventory({ sku, warehouseId, qty, type, reason })`.

## Panel Super-admin.dc.html

| Campo mock | Llamada | Asignación |
|---|---|---|
| `kpis` | `AplikaAPI.adminMetrics()` | `this.kpis = r.kpis` |
| `tenants` | `AplikaAPI.adminTenants('todos')` | `this.tenants = r.tenants` |
| `planes` | `AplikaAPI.adminPlans()` | `this.planes = r.planes` |
| `health` | `AplikaAPI.adminHealth()` | `this.health = r.health` |
| `incidents` | `AplikaAPI.adminIncidents()` | `this.incidents = r.incidents` |

Botón **Impersonar**: `AplikaAPI.impersonate(tenantId)` → redirige a `r.redirect`.

---

### Notas
- Los filtros por pestaña (estado de pedido, semáforo de inventario, etc.) pueden
  seguir filtrando en cliente sobre el arreglo ya cargado, **o** volver a llamar
  al API con el filtro (`AplikaAPI.orders('pagado')`). Ambas funcionan porque el
  backend acepta el mismo `status`.
- El visual no cambia: solo se sustituye el origen de los datos.
