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
    me: () => get('/api/auth/me'),

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

    // Módulos activos del tenant (nav dinámico del Panel Cliente)
    organizationModules: () => get('/api/organization/modules'),

    // Calendario / Citas (vertical servicios_agenda)
    appointments: {
      list: (from, to, status) => {
        const q = new URLSearchParams();
        if (from) q.set('from', from);
        if (to) q.set('to', to);
        if (status) q.set('status', status);
        return get('/api/appointments?' + q.toString());
      },
      create: (payload) => post('/api/appointments', payload),
      get: (id) => get('/api/appointments/' + id),
      update: (id, payload) => patch('/api/appointments/' + id, payload),
      setStatus: (id, status) => patch('/api/appointments/' + id, { status }),
    },

    // Leads (landing pública)
    lead: (payload) => post('/api/leads', payload),

    // Super-admin
    adminMetrics: () => get('/api/admin/metrics'),
    adminTenants: (status, vertical) => get('/api/admin/tenants?status=' + (status || 'todos') + '&vertical=' + (vertical || 'todos')),
    adminVerticals: () => get('/api/admin/verticals'),
    adminTenantModules: (id) => get('/api/admin/tenants/' + id + '/modules'),
    adminSetTenantModule: (id, moduleKey, enabled) => patch('/api/admin/tenants/' + id + '/modules', { moduleKey, enabled }),
    adminCreateTenant: (payload) => post('/api/admin/tenants', payload),
    adminPlans: () => get('/api/admin/plans'),
    adminHealth: () => get('/api/admin/health'),
    adminIncidents: () => get('/api/admin/incidents'),
    impersonate: (id) => post('/api/admin/tenants/' + id + '/impersonate'),
  };
})();
