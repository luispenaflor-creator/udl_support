import { db } from './supabase/server';
import { redirect } from 'next/navigation';

export async function access(roles?: string[]) {
  const s = await db(), { data: { user } } = await s.auth.getUser();
  if (!user) redirect('/login');
  const { data: p } = await s.from('profiles').select('*').eq('id', user.id).single();
  if (!p) redirect('/login');
  // Cuenta desactivada por un administrador: se cierra la sesión.
  if (p.active === false) {
    await s.auth.signOut();
    redirect('/login');
  }
  if (roles && !roles.includes(p.role)) redirect('/');
  return { s, user, p };
}
