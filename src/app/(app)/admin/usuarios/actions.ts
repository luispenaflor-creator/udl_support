'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { access } from '@/lib/auth';
import { allCampusNames } from '@/lib/campuses';
import { isolatedPublicClient, serviceClient } from '@/lib/supabase/admin';
import { siteUrl } from '@/lib/siteUrl';

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

// Casillas: marcada = 'on'; sin marcar el navegador no la envía y read() la deja en '' (antes fallaba al desactivar).
const updateSchema = z.object({ ...profileFields, id: z.string().uuid(), active: z.string().optional(), notify_email: z.string().optional() });

// Foto enviada por el selector (JPEG reducido en el navegador, como data URL). Se guarda en el bucket público "avatars".
const MAX_AVATAR = 1_500_000;
async function avatarFrom(f: FormData, userId: string, fallback: string | null): Promise<string | null> {
  if (f.get('avatar_remove') === '1') return null;
  const raw = String(f.get('avatar_data') ?? '');
  if (!raw) return fallback;
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(raw);
  if (!m) back('error', 'La foto no tiene un formato válido');
  const bytes = Buffer.from(m![2], 'base64');
  if (bytes.length > MAX_AVATAR) back('error', 'La foto es demasiado grande');
  const admin = serviceClient();
  if (!admin) back('error', 'Subir fotos requiere SUPABASE_SERVICE_ROLE_KEY en el servidor');
  const ext = m![1] === 'jpeg' ? 'jpg' : m![1];
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await admin!.storage.from('avatars').upload(path, bytes, { contentType: `image/${m![1]}`, upsert: true, cacheControl: '31536000' });
  if (error) back('error', /bucket/i.test(error.message) ? 'Falta ejecutar la migración 202611090001 (bucket de fotos)' : `No se pudo subir la foto: ${error.message}`);
  return admin!.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

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
  const avatar = await avatarFrom(f, id!, d.avatar_url);

  // El perfil lo escribe el administrador con su propia sesión (política profiles_admin).
  const { error: pe } = await s.from('profiles').upsert({
    id, email: d.email, full_name: d.full_name, role: d.role, campus: d.campus, job_title: d.job_title, avatar_url: avatar,
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
  const avatar = await avatarFrom(f, d.id, d.avatar_url);
  const patch: Record<string, unknown> = { full_name: d.full_name, role: d.role, campus: d.campus, job_title: d.job_title, avatar_url: avatar, active };
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

// Cambia el correo de acceso (Auth) y el del perfil. Requiere la clave de servicio.
export async function changeEmail(f: FormData) {
  const { s, user } = await access(['administrador']);
  const id = z.string().uuid().safeParse(f.get('id'));
  const email = z.string().trim().toLowerCase().email('Correo inválido').safeParse(f.get('email'));
  if (!id.success) back('error', 'Usuario inválido');
  if (!email.success) back('error', email.error!.issues[0].message);
  const admin = serviceClient();
  if (!admin) back('error', 'Cambiar el correo requiere SUPABASE_SERVICE_ROLE_KEY en el servidor');
  const { data: before } = await s.from('profiles').select('email,full_name').eq('id', id.data!).single();
  if (!before) back('error', 'El usuario no existe');
  if (before!.email === email.data) back('ok', 'El correo no cambió.', `#u-${id.data}`);
  const { data: taken } = await s.from('profiles').select('id').eq('email', email.data!).neq('id', id.data!).maybeSingle();
  if (taken) back('error', 'Ese correo ya pertenece a otra cuenta');
  // Se confirma de inmediato para que la persona pueda entrar con el correo nuevo.
  const { error: ae } = await admin!.auth.admin.updateUserById(id.data!, { email: email.data!, email_confirm: true });
  if (ae) back('error', /already|registered|exists/i.test(ae.message) ? 'Ese correo ya está registrado' : `Supabase no cambió el correo: ${ae.message}`);
  const { error: pe } = await s.from('profiles').update({ email: email.data! }).eq('id', id.data!);
  if (pe) back('error', `El acceso cambió, pero no el perfil: ${pe.message}`);
  await s.from('audit_logs').insert({ actor_id: user.id, action: 'usuario_correo_cambiado', entity_type: 'profiles', entity_id: id.data, metadata: { cambios: { email: { de: before!.email, a: email.data } } } });
  revalidatePath('/admin/usuarios');
  back('ok', `Correo de ${before!.full_name} actualizado. Ahora entra con ${email.data}.`, `#u-${id.data}`);
}

/**
 * Elimina una cuenta definitivamente. Solo si no tiene historial: tickets, mensajes, evaluaciones, escalaciones
 * o acciones registradas. Si lo tiene, se debe desactivar para conservar la trazabilidad.
 */
export async function deleteUser(f: FormData) {
  const { s, user } = await access(['administrador']);
  const id = z.string().uuid().safeParse(f.get('id'));
  if (!id.success) back('error', 'Usuario inválido');
  if (id.data === user.id) back('error', 'No puedes eliminar tu propia cuenta');
  const admin = serviceClient();
  if (!admin) back('error', 'Eliminar cuentas requiere SUPABASE_SERVICE_ROLE_KEY en el servidor');
  const { data: target } = await s.from('profiles').select('email,full_name,role').eq('id', id.data!).single();
  if (!target) back('error', 'El usuario no existe');
  if (String(f.get('confirm') ?? '').trim().toLowerCase() !== target!.email.toLowerCase()) back('error', 'Para confirmar, escribe exactamente el correo de la cuenta');

  const uid = id.data!;
  const count = async (table: string, col: string) => (await admin!.from(table).select('*', { count: 'exact', head: true }).eq(col, uid)).count ?? 0;
  const refs = {
    tickets: (await count('tickets', 'requester_id')) + (await count('tickets', 'assignee_id')),
    mensajes: await count('ticket_comments', 'author_id'),
    historial: await count('ticket_events', 'actor_id'),
    evaluaciones: await count('surveys', 'requester_id'),
    escalaciones: (await count('ticket_escalations', 'requested_by')) + (await count('ticket_escalations', 'attended_by')) + (await count('escalation_updates', 'author_id')),
    auditoria: await count('audit_logs', 'actor_id'),
    adjuntos: await count('attachments', 'uploader_id'),
  };
  const used = Object.entries(refs).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
  if (used.length) back('error', `${target!.full_name} tiene historial (${used.join(', ')}). Desactiva la cuenta para que no pueda entrar y se conserve la trazabilidad.`, `#u-${uid}`);

  await admin!.from('push_subscriptions').delete().eq('user_id', uid);
  // Borrar el usuario de Auth elimina su perfil en cascada (y sus avisos en la app).
  const { error } = await admin!.auth.admin.deleteUser(uid);
  if (error) back('error', `Supabase no eliminó la cuenta: ${error.message}`);
  await s.from('audit_logs').insert({ actor_id: user.id, action: 'usuario_eliminado', entity_type: 'profiles', entity_id: uid, metadata: { email: target!.email, nombre: target!.full_name, role: target!.role } });
  revalidatePath('/admin/usuarios');
  back('ok', `Cuenta de ${target!.full_name} eliminada.`);
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
    const appUrl = siteUrl();
    const { error } = await isolatedPublicClient().auth.resetPasswordForEmail(target!.email, { redirectTo: `${appUrl}/login` });
    if (error) back('error', `No se pudo enviar el correo: ${error.message}`);
  }
  await s.from('audit_logs').insert({ actor_id: user.id, action: 'contrasena_restablecida', entity_type: 'profiles', entity_id: id.data, metadata: { email: target!.email, metodo: admin && password ? 'temporal' : 'correo' } });
  back('ok', admin && password ? `Contraseña temporal asignada a ${target!.full_name}.` : `Se envió un correo de recuperación a ${target!.email}.`);
}
