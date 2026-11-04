import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase/server';

// Regresa al login del mismo dominio desde el que se cerró sesión (local, vista previa o producción).
// 303 convierte el POST del formulario en un GET a /login.
export async function POST(req: NextRequest) {
  const s = await db();
  await s.auth.signOut();
  return NextResponse.redirect(new URL('/login', req.nextUrl.origin), 303);
}
