import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null) as { email?: unknown; password?: unknown } | null;
  if (typeof payload?.email !== 'string' || typeof payload.password !== 'string') {
    return NextResponse.json({ error: 'Escribe tu correo y contraseña.' }, { status: 400 });
  }

  const supabase = await db();
  const { error } = await supabase.auth.signInWithPassword({
    email: payload.email.trim(),
    password: payload.password,
  });

  if (error) {
    return NextResponse.json({ error: 'Supabase rechazó el acceso. Verifica el correo y la contraseña.' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
