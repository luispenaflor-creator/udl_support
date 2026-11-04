-- Avisos dentro de la app (campana + sonido + notificación emergente) en tiempo real.
-- El servidor (clave de servicio) inserta un aviso por destinatario; cada usuario solo ve y marca como leídos los suyos.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete cascade,
  event text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists notifications_own_read on public.notifications;
create policy notifications_own_read on public.notifications for select using (user_id = auth.uid());
drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- El usuario solo puede marcar como leído (columna read_at); insertar lo hace el servidor.
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;
grant select, insert, update, delete on table public.notifications to service_role;

-- Tiempo real: Supabase Realtime transmite los INSERT respetando la RLS (cada quien recibe solo los suyos).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
