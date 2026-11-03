import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await db();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'El acceso se aceptó, pero el navegador no conservó la sesión. Intenta actualizar la página.' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: `La sesión está activa, pero no se pudo leer el perfil: ${profileError.message}` }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: 'La sesión está activa, pero falta el perfil de esta cuenta en la tabla profiles.' }, { status: 403 });
  }
  if (profile.active === false) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: 'Tu cuenta está desactivada. Contacta a la mesa de ayuda.' }, { status: 403 });
  }

  return NextResponse.json({ ok: true, role: profile.role });
}
