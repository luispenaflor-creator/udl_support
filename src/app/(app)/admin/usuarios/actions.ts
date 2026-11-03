'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { access } from '@/lib/auth';
import { allCampusNames } from '@/lib/campuses';
import { isolatedPublicClient, serviceClient } from '@/lib/supabase/admin';

const ROLES = ['solicitante', 'agente', 'directivo', 'administrador'] as const;
const back = (kind: 'ok' | 'error', msg: string, extra = ''): never => redirect(`/admin/usuarios?${kind}=${encodeURIComponent(msg)}${extra}`);

const profileFields = {
  full_name: z.string().trim().min(3, 'Escribe el nombre completo').max(120),
  role: z.enum(ROLES),
  // Se valida contra el catálogo de planteles después del parseo (ver checkCampus).
  campus: z.string().trim().max(60).transform((v) => v || null),
  job_title: z.string().trim().max(120).transform((v) => v || null),
  avatar_url: z.string().trim().max(300)
    .refine((v) => v === '' || v.startsWith('/') || v.startsWith('https://'), 'La foto debe ser una ruta /avatars/… o una URL https')
    .transform((v) => v || null),
};

const createSchema = z.object({
  ...profileFields,
  email: z.string().trim().toLowerCase().email('Correo inválido'),
  password: z.string().min(8, 'La contraseña temporal debe tener al menos 8 caracteres').max(72),
});

const updateSchema = z.object({ ...profileFields, id: z.string().uuid(), active: z.enum(['on']).optional(), notify_email: z.enum(['on']).optional() });

const read = (f: FormData, keys: string[]) => Object.fromEntries(keys.map((k) => [k, f.get(k) ?? '']));

async function checkCampus(s: Awaited<ReturnType<typeof access>>['s'], campus: string | null) {
  if (campus && !(await allCampusNames(s)).includes(campus)) back('error', 'El plantel no existe en el catálogo');
}

export async function createUser(f: FormData) {
  const { s, user } = await access(['administrador']);
  const parsed = createSchema.safeParse(read(f, ['full_name', 'email', 'password', 'role', 'campus', 'job_title', 'avatar_url']));
  if (!parsed.success) back('error', parsed.error.issues[0].message);
  const d = parsed.data!;
  await checkCampus(s, d.campus);

  let id: string | undefined;
  let pendingConfirm = false;
  const admin = serviceClient();
  if (admin) {
    const { data, error } = await admin.auth.admin.createUser({ email: d.email, password: d.password, email_confirm: true, user_metadata: { full_name: d.full_name } });
    if (error) back('error', /already|registered|exists/i.test(error.message) ? 'Ya existe una cuenta con ese correo' : `Supabase no creó la cuenta: ${error.message}`);
    id = data!.user?.id;
  } else {
    // Modo limitado sin clave de servicio: registro público. Puede requerir confirmar el correo.
    const { data, error } = await isolatedPublicClient().auth.signUp({ email: d.email, password: d.password, options: { data: { full_name: d.full_name } } });
    if (error) back('error', `Supabase no creó la cuenta: ${error.message}`);
    if (data!.user && data!.user.identities?.length === 0) back('error', 'Ya existe una cuenta con ese correo');
    id = data!.user?.id;
    pendingConfirm = !data!.session;
  }
  if (!id) back('error', 'Supabase no devolvió el identificador de la cuenta');

  // El perfil lo escribe el administrador con su propia sesión (política profiles_admin).
  const { error: pe } = await s.from('profiles').upsert({
    id, email: d.email, full_name: d.full_name, role: d.role, campus: d.campus, job_title: d.job_title, avatar_url: d.avatar_url,
  });
  if (pe) back('error', `La cuenta se creó, pero no su perfil: ${pe.message}`);

  await s.from('audit_logs').insert({ actor_id: user.id, action: 'usuario_creado', entity_type: 'profiles', entity_id: id, metadata: { email: d.email, role: d.role, campus: d.campus, modo: admin ? 'servicio' : 'registro' } });
  revalidatePath('/admin/usuarios');
  back('ok', pendingConfirm ? `Cuenta creada para ${d.full_name}. Debe confirmar su correo antes de entrar.` : `Cuenta creada para ${d.full_name}.`);
}

export async function updateUser(f: FormData) {
  const { s, user } = await access(['administrador']);
  const parsed = updateSchema.safeParse(read(f, ['id', 'full_name', 'role', 'campus', 'job_title', 'avatar_url', 'active', 'notify_email']));
  if (!parsed.success) back('error', parsed.error.issues[0].message);
  const d = parsed.data!;
  await checkCampus(s, d.campus);
  const active = d.active === 'on';

  // Protección: el administrador no puede quitarse a sí mismo el rol ni desactivarse (conserva el acceso).
  if (d.id === user.id && (d.role !== 'administrador' || !active)) back('error', 'No puedes quitarte el rol de administrador ni desactivar tu propia cuenta');

  const { data: before } = await s.from('profiles').select('*').eq('id', d.id).single();
  if (!before) back('error', 'El usuario no existe');
  const patch: Record<string, unknown> = { full_name: d.full_name, role: d.role, campus: d.campus, job_title: d.job_title, avatar_url: d.avatar_url, active };
  if ('notify_email' in before!) patch.notify_email = d.notify_email === 'on';
  const { error } = await s.from('profiles').update(patch).eq('id', d.id);
  if (error) back('error', /active/.test(error.message) ? 'Falta ejecutar la migración 202611040001_usuarios_activos.sql' : error.message);

  const changes = Object.fromEntries(Object.entries(patch).filter(([k, v]) => before[k] !== v).map(([k, v]) => [k, { de: before[k] ?? null, a: v }]));
  if (Object.keys(changes).length) {
    await s.from('audit_logs').insert({ actor_id: user.id, action: 'usuario_actualizado', entity_type: 'profiles', entity_id: d.id, metadata: { email: before.email, cambios: changes } });
  }
  revalidatePath('/admin/usuarios');
  back('ok', `Perfil de ${d.full_name} actualizado.`, `#u-${d.id}`);
}

export async function resetPassword(f: FormData) {
  const { s, user } = await access(['administrador']);
  const id = z.string().uuid().safeParse(f.get('id'));
  if (!id.success) back('error', 'Usuario inválido');
  const { data: target } = await s.from('profiles').select('email,full_name').eq('id', id.data).single();
  if (!target) back('error', 'El usuario no existe');

  const admin = serviceClient();
  const password = String(f.get('password') ?? '');
  if (admin && password) {
    if (password.length < 8) back('error', 'La contraseña temporal debe tener al menos 8 caracteres');
    const { error } = await admin.auth.admin.updateUserById(id.data!, { password });
    if (error) back('error', error.message);
  } else {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const { error } = await isolatedPublicClient().auth.resetPasswordForEmail(target!.email, { redirectTo: `${appUrl}/login` });
    if (error) back('error', `No se pudo enviar el correo: ${error.message}`);
  }
  await s.from('audit_logs').insert({ actor_id: user.id, action: 'contrasena_restablecida', entity_type: 'profiles', entity_id: id.data, metadata: { email: target!.email, metodo: admin && password ? 'temporal' : 'correo' } });
  back('ok', admin && password ? `Contraseña temporal asignada a ${target!.full_name}.` : `Se envió un correo de recuperación a ${target!.email}.`);
}
