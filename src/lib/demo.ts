// Modo demo: activo cuando aún no hay Supabase configurado (pruebas locales).
// En este modo, el login se valida en el servidor sin Supabase y el frontend
// conserva sus datos demo embebidos (no llama a los endpoints de datos).
export function isDemo(): boolean {
  if (process.env.APLIKA_DEMO === 'true') return true;
  return !process.env.NEXT_PUBLIC_SUPABASE_URL;
}

// Cookie que recuerda con qué correo se inició sesión en modo demo, para que
// /api/auth/me pueda devolver la identidad correcta (nombre y tenant) por panel.
export const DEMO_COOKIE = 'aplika_demo_user';

export interface DemoIdentity {
  name: string;
  email: string;
  role: string;
  org: { name: string; plan: string | null } | null;
}

// Usuarios demo conocidos (los del seed). Cualquier otro correo obtiene una
// identidad derivada para que el panel muestre algo coherente.
const DEMO_USERS: Record<string, DemoIdentity> = {
  'admin@aplika.ai': { name: 'Admin Aplika', email: 'admin@aplika.ai', role: 'super_admin', org: null },
  'juan@refanorte.mx': { name: 'Juan Méndez', email: 'juan@refanorte.mx', role: 'tenant_admin', org: { name: 'Refaccionaria del Norte', plan: 'Pro' } },
  'ana@vitalis.mx': { name: 'Ana Sofía Rivera', email: 'ana@vitalis.mx', role: 'tenant_admin', org: { name: 'Consultorio Vitalis', plan: 'Pro' } },
};

/** Identidad demo a partir del correo (para login y /api/auth/me). */
export function demoIdentity(email?: string | null): DemoIdentity {
  const key = (email || '').trim().toLowerCase();
  // Sin correo (acceso directo sin login): default coherente con los datos
  // demo embebidos del panel (Refaccionaria del Norte).
  if (!key) return DEMO_USERS['juan@refanorte.mx'];
  if (DEMO_USERS[key]) return DEMO_USERS[key];

  const isAdmin = key === 'admin@aplika.ai';
  const local = (key.split('@')[0] || 'usuario');
  const name = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || 'Usuario demo';

  return {
    name,
    email: key || 'demo@aplika.ai',
    role: isAdmin ? 'super_admin' : 'tenant_admin',
    org: isAdmin ? null : { name: 'Mi negocio', plan: 'Pro' },
  };
}
