-- API role grants required for Supabase Data API access.
-- Row Level Security remains enabled and continues to restrict which rows
-- authenticated users can read or modify.
grant usage on schema public to authenticated;

grant select, insert, update, delete on table
  public.profiles,
  public.app_settings,
  public.tickets,
  public.ticket_comments,
  public.ticket_events,
  public.audit_logs,
  public.surveys,
  public.google_mail_config,
  public.email_ingest,
  public.push_subscriptions,
  public.attachments
to authenticated;

grant execute on function public.current_role() to authenticated;
grant execute on function public.is_staff() to authenticated;
