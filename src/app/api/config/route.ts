import { ok, handle } from '@/lib/api';
import { isDemo } from '@/lib/demo';

export const dynamic = 'force-dynamic';

// GET /api/config — bandera que el frontend usa para decidir si llama al API
// real (Supabase configurado) o conserva sus datos demo embebidos.
export const GET = handle(async () => ok({ demo: isDemo() }));
