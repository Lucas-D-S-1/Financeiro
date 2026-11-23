-- Execute somente no SQL Editor do projeto exclusivo do piloto.
-- Cadastre pilot_worker_url e pilot_worker_key no Vault antes de executar.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'pilot_worker_url'
      and decrypted_secret ~ '^https://[a-z]{20}\.supabase\.co/functions/v1/pilot/worker$'
      and decrypted_secret not like '%rxfeyrnayhvyfonuxddt%'
  ) or not exists (
    select 1 from vault.decrypted_secrets where name = 'pilot_worker_key' and length(decrypted_secret) >= 32
  ) then raise exception 'Configure o cofre do piloto antes do agendamento'; end if;
end $$;

select cron.schedule('pluggy-piloto-worker', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'pilot_worker_url'),
    headers := jsonb_build_object('Content-Type','application/json','X-Pilot-Worker',
      (select decrypted_secret from vault.decrypted_secrets where name = 'pilot_worker_key')),
    body := '{}'::jsonb, timeout_milliseconds := 40000
  );
$job$);
select cron.schedule('pluggy-piloto-reconciliacao', '30 15 * * *', 'select public.pilot_reconcile();');
commit;
