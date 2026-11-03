-- El proyecto no expone automáticamente las tablas nuevas a la API, así que el rol service_role
-- (usado solo en el servidor con SUPABASE_SERVICE_ROLE_KEY) no tenía permisos sobre ellas:
-- "permission denied for table tickets". Sin esto no funcionan las notificaciones ni su bitácora.
-- service_role ignora RLS por diseño; la clave nunca debe llegar al navegador.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Tablas creadas en el futuro también quedan disponibles para el servidor.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- Las tablas nuevas de las migraciones recientes también necesitan acceso para la app (rol authenticated).
grant select, insert, update, delete on table public.campuses to authenticated;
grant select, insert, update on table public.ticket_escalations to authenticated;
grant select on table public.notification_log to authenticated;
