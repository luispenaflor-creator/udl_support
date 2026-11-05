-- Planteles reales, salón/área en tickets, tiempo de solución desde la asignación y fotos de perfil.
-- No borra datos: los planteles anteriores solo se desactivan (sus tickets conservan el nombre).

-- =====================================================================
-- 1. Catálogo de planteles de la Universidad de Londres
-- =====================================================================
insert into public.campuses (name) values
  ('Vertiz'), ('Orizaba'), ('Frontera'), ('Luis Cabrera'), ('Querétaro'),
  ('San Luis Potosí'), ('Insurgentes'), ('Medellín'), ('Home Office')
on conflict (name) do update set active = true;

update public.campuses set active = false
where name not in ('Vertiz', 'Orizaba', 'Frontera', 'Luis Cabrera', 'Querétaro', 'San Luis Potosí', 'Insurgentes', 'Medellín', 'Home Office');

-- =====================================================================
-- 2. Salón / área: texto libre en el ticket + catálogo opcional por plantel
--    (el catálogo se llenará después; mientras tanto se escribe a mano).
-- =====================================================================
alter table public.tickets add column if not exists area text check (area is null or length(area) <= 80);

create table if not exists public.campus_areas (
  id uuid primary key default gen_random_uuid(),
  campus text not null references public.campuses(name) on update cascade on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (campus, name)
);
alter table public.campus_areas enable row level security;
drop policy if exists campus_areas_read on public.campus_areas;
create policy campus_areas_read on public.campus_areas for select using (auth.uid() is not null);
drop policy if exists campus_areas_admin on public.campus_areas;
create policy campus_areas_admin on public.campus_areas for all
  using (public.current_role() = 'administrador') with check (public.current_role() = 'administrador');
grant select, insert, update, delete on table public.campus_areas to authenticated;
grant all on table public.campus_areas to service_role;

-- =====================================================================
-- 3. Tiempo de solución: desde la primera asignación hasta la resolución
-- =====================================================================
alter table public.tickets add column if not exists assigned_at timestamptz;

create or replace function public.stamp_ticket_assignment() returns trigger
language plpgsql as $$
begin
  if new.assignee_id is not null and new.assigned_at is null then
    new.assigned_at := now();
  end if;
  return new;
end $$;

drop trigger if exists tickets_assigned_at on public.tickets;
create trigger tickets_assigned_at before insert or update of assignee_id on public.tickets
  for each row execute function public.stamp_ticket_assignment();

-- Tickets existentes: se toma la primera asignación registrada en el historial;
-- si no hay historial (datos de ejemplo), la fecha de creación.
update public.tickets t set assigned_at = coalesce(
  (select min(e.created_at) from public.ticket_events e
    where e.ticket_id = t.id and e.payload -> 'asignacion' ->> 'a' is not null),
  t.created_at)
where t.assignee_id is not null and t.assigned_at is null;
update public.tickets set assigned_at = resolved_at where resolved_at is not null and assigned_at > resolved_at;

-- =====================================================================
-- 4. Fotos de perfil (Storage). Las sube el servidor con la clave de servicio;
--    el bucket es público solo para lectura de las imágenes.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
