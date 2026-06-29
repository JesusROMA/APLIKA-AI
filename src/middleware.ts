import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware: refresca la sesión de Supabase en cada request (cookies) para que
 * Server Components y Route Handlers vean un token vigente.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresca el token si expiró.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Excluye assets estáticos, el frontend DC y el webhook de Stripe (sin cookies).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|dc/|api/webhooks/).*)'],
};
