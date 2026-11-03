-- Permite desactivar cuentas sin borrarlas (se conservan sus tickets, comentarios y auditoría).
-- La aplicación rechaza el acceso a perfiles inactivos (src/lib/auth.ts y /auth/session-check).
alter table public.profiles add column if not exists active boolean not null default true;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

-- Un usuario inactivo deja de ser considerado personal de soporte aunque conserve su rol.
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('agente', 'directivo', 'administrador') and active from public.profiles where id = auth.uid()), false)
$$;
