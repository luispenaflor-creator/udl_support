-- =====================================================================
-- 1. SLA por prioridad (horas corridas). Antes todos los tickets usaban 8 h / 48 h fijas.
-- =====================================================================
alter table public.app_settings add column if not exists sla_policy jsonb not null default
  '{"urgente":{"first":1,"resolve":4},"alta":{"first":4,"resolve":24},"media":{"first":8,"resolve":48},"baja":{"first":24,"resolve":72}}'::jsonb;

-- Calcula los vencimientos en la base: el solicitante no puede leer app_settings y así nadie puede alterarlos al crear.
-- Al cambiar la prioridad (p. ej. al escalar) los plazos se recalculan desde la creación del ticket.
create or replace function public.apply_ticket_sla() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pol jsonb;
  first_h numeric;
  resolve_h numeric;
begin
  if tg_op = 'UPDATE' and new.priority is not distinct from old.priority then
    return new;
  end if;
  select sla_policy into pol from public.app_settings where id = 1;
  first_h := coalesce((pol -> new.priority::text ->> 'first')::numeric, 8);
  resolve_h := coalesce((pol -> new.priority::text ->> 'resolve')::numeric, 48);
  new.first_response_due_at := coalesce(new.created_at, now()) + make_interval(secs => first_h * 3600);
  new.resolution_due_at := coalesce(new.created_at, now()) + make_interval(secs => resolve_h * 3600);
  return new;
end $$;

drop trigger if exists tickets_sla on public.tickets;
create trigger tickets_sla before insert or update of priority on public.tickets
  for each row execute function public.apply_ticket_sla();

-- =====================================================================
-- 2. Notificaciones por correo
-- =====================================================================
-- Preferencia por usuario (el administrador puede desactivarla).
alter table public.profiles add column if not exists notify_email boolean not null default true;

-- Bitácora de cada intento: permite diagnosticar entregas. Solo el servidor (clave de servicio) escribe.
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  ticket_id uuid references public.tickets(id) on delete set null,
  recipient text not null,
  subject text,
  status text not null check (status in ('enviado', 'fallido', 'omitido')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists notification_log_created_idx on public.notification_log(created_at desc);

alter table public.notification_log enable row level security;
drop policy if exists notification_log_admin_read on public.notification_log;
create policy notification_log_admin_read on public.notification_log for select using (public.current_role() = 'administrador');
grant select on table public.notification_log to authenticated;
