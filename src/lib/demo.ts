// Modo demo: activo cuando aún no hay Supabase configurado (pruebas locales).
// En este modo, el login se valida en el servidor sin Supabase y el frontend
// conserva sus datos demo embebidos (no llama a los endpoints de datos).
export function isDemo(): boolean {
  if (process.env.APLIKA_DEMO === 'true') return true;
  return !process.env.NEXT_PUBLIC_SUPABASE_URL;
}
