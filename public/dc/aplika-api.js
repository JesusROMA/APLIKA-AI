/* ============================================================================
 * Aplika.ai — cliente API para el frontend Claude Design (.dc.html)
 * Se carga junto a support.js. Expone window.AplikaAPI con métodos que
 * devuelven EXACTAMENTE las formas que cada pantalla ya sabe renderizar.
 * Las cookies de sesión (Supabase) viajan solas (same-origin).
 * ==========================================================================*/
(function () {
  async function req(path, opts) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    if (!res.ok) {
      let msg = 'Error ' + res.status;
      try { msg = (await res.json()).error || msg; } catch (e) {}
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }
  const get = (p) => req(p);
  const post = (p, body) => req(p, { method: 'POST', body: JSON.stringify(body || {}) });
  const patch = (p, body) => req(p, { method: 'PATCH', body: JSON.stringify(body || {}) });

  window.AplikaAPI = {
    // Config (¿modo demo?)
    config: () => get('/api/config'),

    // Auth
    login: (email, password) => post('/api/auth/login', { email, password }),
    logout: () => post('/api/auth/logout'),

    // Dashboard
    kpis: (period) => get('/api/dashboard/kpis?period=' + (period || '30d')),
    salesTrend: () => get('/api/dashboard/sales-trend'),

    // Ventas / pedidos
    orders: (status, search, limit) => {
      const q = new URLSearchParams();
      if (status) q.set('status', status);
      if (search) q.set('search', search);
      if (limit) q.set('limit', String(limit));
      return get('/api/orders?' + q.toString());
    },
    orderItems: (idOrFolio) => get('/api/orders/' + encodeURIComponent(idOrFolio) + '/items'),
    createOrder: (payload) => post('/api/orders', payload),
    transitionOrder: (idOrFolio, status) => post('/api/orders/' + encodeURIComponent(idOrFolio) + '/transition', { status }),
    checkout: (orderId) => post('/api/payments/checkout', { orderId }),

    // Inventario
    inventory: (status, warehouse) => {
      const q = new URLSearchParams();
      if (status) q.set('status', status);
      if (warehouse) q.set('warehouse', warehouse);
      return get('/api/inventory/products?' + q.toString());
    },
    inventorySummary: () => get('/api/inventory/summary'),
    inventoryAlerts: () => get('/api/inventory/alerts'),
    warehouses: () => get('/api/inventory/warehouses'),
    kardex: (sku) => get('/api/inventory/' + encodeURIComponent(sku) + '/kardex'),
    adjustInventory: (payload) => post('/api/inventory/adjust', payload),

    // Facturación
    invoices: (status) => get('/api/invoices?status=' + (status || 'todas')),
    invoicesSummary: () => get('/api/invoices/summary'),
    timbrar: (id) => post('/api/invoices/' + id + '/timbrar'),
    cancelarFactura: (id) => post('/api/invoices/' + id + '/cancelar'),

    // Pagos
    payments: () => get('/api/payments'),
    paymentsSummary: () => get('/api/payments/summary'),
    paymentsRevenue: () => get('/api/payments/revenue'),

    // CRM
    customers: () => get('/api/customers'),
    customer: (id) => get('/api/customers/' + id),
    createCustomer: (payload) => post('/api/customers', payload),

    // Agente IA
    aiSummary: () => get('/api/ai-agent/summary'),
    aiMetrics: () => get('/api/ai-agent/metrics'),
    aiConversations: () => get('/api/ai-agent/conversations'),

    // Leads (landing pública)
    lead: (payload) => post('/api/leads', payload),

    // Super-admin
    adminMetrics: () => get('/api/admin/metrics'),
    adminTenants: (status) => get('/api/admin/tenants?status=' + (status || 'todos')),
    adminPlans: () => get('/api/admin/plans'),
    adminHealth: () => get('/api/admin/health'),
    adminIncidents: () => get('/api/admin/incidents'),
    impersonate: (id) => post('/api/admin/tenants/' + id + '/impersonate'),
  };
})();
