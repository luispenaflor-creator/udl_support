-- =====================================================================
-- 1. Catálogo de planteles editable (antes era una lista fija en el CHECK de tickets)
-- =====================================================================
create table if not exists public.campuses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 2 and 60),
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.campuses (name) values
  ('Centro'), ('Roma'), ('San Ángel'), ('Coapa'), ('Insurgentes'), ('Reforma'), ('Satélite'), ('Zaragoza')
on conflict (name) do nothing;
-- Cualquier plantel ya usado en tickets o perfiles se conserva en el catálogo.
insert into public.campuses (name) select distinct campus from public.tickets where campus is not null on conflict (name) do nothing;
insert into public.campuses (name) select distinct campus from public.profiles where campus is not null on conflict (name) do nothing;

-- Se reemplaza el CHECK fijo por una llave foránea: renombrar un plantel actualiza tickets y perfiles;
-- un plantel con tickets no se puede borrar (se desactiva).
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.tickets'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%campus%'
  loop
    execute format('alter table public.tickets drop constraint %I', c);
  end loop;
end $$;
alter table public.tickets drop constraint if exists tickets_campus_fk;
alter table public.tickets add constraint tickets_campus_fk foreign key (campus) references public.campuses(name) on update cascade on delete restrict;
alter table public.profiles drop constraint if exists profiles_campus_fk;
alter table public.profiles add constraint profiles_campus_fk foreign key (campus) references public.campuses(name) on update cascade on delete set null;

alter table public.campuses enable row level security;
drop policy if exists campuses_read on public.campuses;
create policy campuses_read on public.campuses for select using (auth.uid() is not null);
drop policy if exists campuses_admin on public.campuses;
create policy campuses_admin on public.campuses for all using (public.current_role() = 'administrador') with check (public.current_role() = 'administrador');
grant select, insert, update, delete on table public.campuses to authenticated;

-- =====================================================================
-- 2. Asignación por rol
--    Directivo y administración asignan/reasignan a cualquier agente.
--    El agente solo puede tomar tickets sin asignar (asignándose a sí mismo) y trabajar los suyos.
-- =====================================================================
alter table public.tickets add column if not exists resolution_notes text;

drop policy if exists tickets_update on public.tickets;
drop policy if exists tickets_update_supervisor on public.tickets;
create policy tickets_update_supervisor on public.tickets for update
  using (public.current_role() in ('directivo', 'administrador') and public.is_staff())
  with check (public.current_role() in ('directivo', 'administrador') and public.is_staff());
drop policy if exists tickets_update_agent on public.tickets;
create policy tickets_update_agent on public.tickets for update
  using (public.current_role() = 'agente' and public.is_staff() and (assignee_id = auth.uid() or assignee_id is null))
  with check (public.current_role() = 'agente' and public.is_staff() and assignee_id = auth.uid());

-- =====================================================================
-- 3. Escalaciones (agente → directivo, o solicitante por falta de atención)
-- =====================================================================
create table if not exists public.ticket_escalations (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  requester_role public.app_role not null,
  reason text not null check (length(trim(reason)) >= 10),
  status text not null default 'pendiente' check (status in ('pendiente', 'atendida')),
  response text,
  attended_by uuid references public.profiles(id),
  attended_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ticket_escalations_status_idx on public.ticket_escalations(status, created_at desc);
create index if not exists ticket_escalations_ticket_idx on public.ticket_escalations(ticket_id, created_at desc);

alter table public.ticket_escalations enable row level security;
drop policy if exists escalations_read on public.ticket_escalations;
create policy escalations_read on public.ticket_escalations for select using (
  public.is_staff()
  or exists (select 1 from public.tickets t where t.id = ticket_id and t.requester_id = auth.uid())
);
-- Solo sobre tickets abiertos: el solicitante en los suyos, el agente en los asignados a él.
-- Los tiempos de espera del solicitante se validan en el servidor (src/lib/escalation.ts).
drop policy if exists escalations_insert on public.ticket_escalations;
create policy escalations_insert on public.ticket_escalations for insert with check (
  requested_by = auth.uid()
  and requester_role = public.current_role()
  and status = 'pendiente'
  and exists (
    select 1 from public.tickets t
    where t.id = ticket_id and t.status not in ('resuelto', 'cerrado')
      and (
        (public.current_role() = 'solicitante' and t.requester_id = auth.uid())
        or (public.current_role() = 'agente' and t.assignee_id = auth.uid() and public.is_staff())
        or (public.current_role() in ('directivo', 'administrador') and public.is_staff())
      )
  )
);
drop policy if exists escalations_attend on public.ticket_escalations;
create policy escalations_attend on public.ticket_escalations for update
  using (public.current_role() in ('directivo', 'administrador') and public.is_staff())
  with check (public.current_role() in ('directivo', 'administrador') and public.is_staff());
grant select, insert, update on table public.ticket_escalations to authenticated;
