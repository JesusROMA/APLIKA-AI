import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

/** Error de API con código HTTP. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Respuesta JSON exitosa. */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/**
 * Envuelve un handler de Route para centralizar el manejo de errores:
 * ApiError -> su status; ZodError -> 422; resto -> 500 (sin filtrar internos).
 */
export function handle(
  fn: (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>,
) {
  return async (req: Request, ctx: { params: Record<string, string> }) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json(
          { error: err.message, details: err.details },
          { status: err.status },
        );
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: 'Datos inválidos', details: err.flatten() },
          { status: 422 },
        );
      }
      console.error('[api] error no controlado:', err);
      void logAppError(req, err); // fire-and-forget: jamás rompe la respuesta
      return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
  };
}

/**
 * Registra el error 500 en `app_errors` (0027) para el dashboard del
 * super-admin. Best-effort: si Supabase no está configurado o falla el
 * insert, solo queda el console.error de arriba.
 */
async function logAppError(req: Request, err: unknown): Promise<void> {
  try {
    const { createSupabaseAdminClient } = await import('@/lib/supabase/admin');
    // any: tabla 0027 fuera de los tipos generados (misma deuda que otras rutas)
    // eslint-disable-next-line
    const admin = createSupabaseAdminClient() as any;
    const e = err instanceof Error ? err : new Error(String(err));
    await admin.from('app_errors').insert({
      route: new URL(req.url).pathname,
      method: req.method,
      status: 500,
      message: e.message.slice(0, 500),
      stack: (e.stack ?? '').split('\n').slice(0, 6).join('\n'),
    });
  } catch {
    /* nunca interferir con la respuesta al cliente */
  }
}
