-- Puesto y foto de perfil para mostrar a los agentes en tickets y ranking.
alter table public.profiles add column if not exists job_title text;
alter table public.profiles add column if not exists avatar_url text;

-- El solicitante puede ver nombre, puesto y foto del agente asignado a sus tickets.
-- La subconsulta usa la RLS de tickets (requester_id = auth.uid()); current_role() es security definer, sin recursión.
drop policy if exists profiles_read_assigned_agent on public.profiles;
create policy profiles_read_assigned_agent on public.profiles for select using (
  exists (select 1 from public.tickets t where t.assignee_id = profiles.id and t.requester_id = auth.uid())
);

-- Historial: hasta ahora no existía política de inserción, por lo que los eventos de cambio se descartaban.
drop policy if exists event_staff_insert on public.ticket_events;
create policy event_staff_insert on public.ticket_events for insert with check (public.is_staff() and actor_id = auth.uid());

-- Evaluación de la atención: solo el solicitante del ticket, solo una vez y solo si está resuelto o cerrado.
drop policy if exists survey_insert on public.surveys;
create policy survey_insert on public.surveys for insert with check (
  requester_id = auth.uid()
  and score between 1 and 5
  and exists (
    select 1 from public.tickets t
    where t.id = ticket_id and t.requester_id = auth.uid() and t.status in ('resuelto', 'cerrado')
  )
);
