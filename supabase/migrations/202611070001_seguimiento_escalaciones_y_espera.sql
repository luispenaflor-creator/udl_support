-- =====================================================================
-- 1. Escalaciones con seguimiento: pendiente → en_seguimiento → cerrada
--    Antes, "atendida" las daba por terminadas con una sola respuesta y se perdía la trazabilidad.
-- =====================================================================
alter table public.ticket_escalations drop constraint if exists ticket_escalations_status_check;
alter table public.ticket_escalations add column if not exists closed_at timestamptz;
alter table public.ticket_escalations add column if not exists closed_by uuid references public.profiles(id);

-- Bitácora de cada acción sobre una escalación (notas, reasignaciones, prioridad, cierre).
create table if not exists public.escalation_updates (
  id uuid primary key default gen_random_uuid(),
  escalation_id uuid not null references public.ticket_escalations(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id uuid references public.profiles(id),
  kind text not null check (kind in ('seguimiento', 'reasignacion', 'prioridad', 'cierre')),
  note text not null,
  created_at timestamptz not null default now()
);
create index if not exists escalation_updates_esc_idx on public.escalation_updates(escalation_id, created_at);

-- Las escalaciones "atendidas" anteriores conservan su respuesta como primera entrada de la bitácora y quedan cerradas.
insert into public.escalation_updates (escalation_id, ticket_id, author_id, kind, note, created_at)
select e.id, e.ticket_id, e.attended_by, 'cierre', e.response, coalesce(e.attended_at, now())
from public.ticket_escalations e
where e.status = 'atendida' and e.response is not null
  and not exists (select 1 from public.escalation_updates u where u.escalation_id = e.id);
update public.ticket_escalations set status = 'cerrada', closed_at = coalesce(attended_at, now()), closed_by = attended_by where status = 'atendida';
alter table public.ticket_escalations add constraint ticket_escalations_status_check check (status in ('pendiente', 'en_seguimiento', 'cerrada'));

alter table public.escalation_updates enable row level security;
-- Personal: todo. Solicitante: solo la bitácora de escalaciones que él mismo hizo.
drop policy if exists escalation_updates_read on public.escalation_updates;
create policy escalation_updates_read on public.escalation_updates for select using (
  public.is_staff()
  or exists (
    select 1 from public.ticket_escalations e join public.tickets t on t.id = e.ticket_id
    where e.id = escalation_id and e.requester_role = 'solicitante' and t.requester_id = auth.uid()
  )
);
drop policy if exists escalation_updates_insert on public.escalation_updates;
create policy escalation_updates_insert on public.escalation_updates for insert with check (
  public.current_role() in ('directivo', 'administrador') and public.is_staff() and author_id = auth.uid()
);
grant select, insert on table public.escalation_updates to authenticated;
grant select, insert, update, delete on table public.escalation_updates to service_role;

-- Al resolver o cerrar el ticket, sus escalaciones abiertas se cierran solas y queda registrado.
create or replace function public.close_escalations_on_resolve() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('resuelto', 'cerrado') and old.status not in ('resuelto', 'cerrado') then
    insert into public.escalation_updates (escalation_id, ticket_id, author_id, kind, note)
    select e.id, e.ticket_id, auth.uid(), 'cierre',
           'Cerrada automáticamente: el ticket se marcó como ' || new.status::text || '.'
    from public.ticket_escalations e where e.ticket_id = new.id and e.status <> 'cerrada';
    update public.ticket_escalations set status = 'cerrada', closed_at = now(), closed_by = auth.uid()
    where ticket_id = new.id and status <> 'cerrada';
  end if;
  return new;
end $$;
drop trigger if exists tickets_close_escalations on public.tickets;
create trigger tickets_close_escalations after update of status on public.tickets
  for each row execute function public.close_escalations_on_resolve();

-- =====================================================================
-- 2. "En espera" significa: soporte espera una respuesta del solicitante.
--    Cuando el solicitante responde, el ticket vuelve solo a atención.
-- =====================================================================
create or replace function public.resume_on_requester_reply() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record; next_status public.ticket_status;
begin
  select id, status, requester_id, assignee_id into t from public.tickets where id = new.ticket_id;
  if t.status = 'en_espera' and t.requester_id = new.author_id and coalesce(new.visibility, 'public') = 'public' then
    next_status := case when t.assignee_id is null then 'abierto' else 'en_progreso' end;
    update public.tickets set status = next_status, updated_at = now() where id = t.id;
    insert into public.ticket_events (ticket_id, actor_id, event_type, payload)
    values (t.id, new.author_id, 'actualizacion',
            jsonb_build_object('estado', jsonb_build_object('de', 'en_espera', 'a', next_status), 'origen', 'respuesta_solicitante'));
  end if;
  return new;
end $$;
drop trigger if exists comments_resume_ticket on public.ticket_comments;
create trigger comments_resume_ticket after insert on public.ticket_comments
  for each row execute function public.resume_on_requester_reply();
