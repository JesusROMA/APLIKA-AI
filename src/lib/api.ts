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
      return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
  };
}
