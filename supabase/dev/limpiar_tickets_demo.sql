-- Elimina SOLO los datos de demostración antes de publicar:
--   * tickets cuya descripción empieza con [DEMO-SEED] y todo lo que cuelga de ellos
--   * personas de demostración (correos @demo.udl.test) y su actividad
-- Ejecutar en Supabase > SQL Editor. No toca tickets ni usuarios reales.
-- Primero revisa cuánto se borrará:
select (select count(*) from public.tickets where description like '[DEMO-SEED]%') as tickets_demo,
       (select count(*) from public.profiles where email like '%@demo.udl.test') as personas_demo;

begin;
-- Tickets demo (comentarios, eventos, encuestas, adjuntos y escalaciones)
delete from public.surveys            where ticket_id in (select id from public.tickets where description like '[DEMO-SEED]%');
delete from public.ticket_comments    where ticket_id in (select id from public.tickets where description like '[DEMO-SEED]%');
delete from public.ticket_events      where ticket_id in (select id from public.tickets where description like '[DEMO-SEED]%');
delete from public.attachments        where ticket_id in (select id from public.tickets where description like '[DEMO-SEED]%');
delete from public.ticket_escalations where ticket_id in (select id from public.tickets where description like '[DEMO-SEED]%');
delete from public.tickets where description like '[DEMO-SEED]%';

-- Actividad de personas demo que haya quedado en tickets reales
delete from public.surveys            where requester_id in (select id from public.profiles where email like '%@demo.udl.test');
delete from public.ticket_comments    where author_id    in (select id from public.profiles where email like '%@demo.udl.test');
delete from public.ticket_events      where actor_id     in (select id from public.profiles where email like '%@demo.udl.test');
delete from public.ticket_escalations where requested_by in (select id from public.profiles where email like '%@demo.udl.test')
                                         or attended_by  in (select id from public.profiles where email like '%@demo.udl.test');
update public.tickets set assignee_id = null where assignee_id in (select id from public.profiles where email like '%@demo.udl.test');
delete from public.notification_log where recipient like '%@demo.udl.test';

-- Personas demo (auth.users borra en cascada identidades y sesiones)
delete from public.profiles where email like '%@demo.udl.test';
delete from auth.users where email like '%@demo.udl.test';
commit;

-- Verificación: ambos conteos deben quedar en 0
select (select count(*) from public.tickets where description like '[DEMO-SEED]%') as tickets_demo,
       (select count(*) from public.profiles where email like '%@demo.udl.test') as personas_demo;
