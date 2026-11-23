create table public.pilot_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version text not null check (version = '2026-11-piloto-1'),
  accepted_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 days'),
  revoked_at timestamptz,
  connect_until timestamptz
);

create table public.pilot_items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  state text not null default 'connecting' check (state in
    ('connecting','syncing','updated','action','partial','failed','disconnecting','disconnected')),
  last_complete timestamptz,
  last_checked timestamptz,
  unique (id, user_id)
);
create index pilot_items_user_idx on public.pilot_items(user_id);

create table public.pilot_accounts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null,
  name text not null,
  kind text not null,
  balance numeric,
  currency text,
  unique (id, item_id, user_id),
  foreign key (item_id, user_id) references public.pilot_items(id, user_id) on delete cascade
);
create index pilot_accounts_user_item_idx on public.pilot_accounts(user_id, item_id);

create table public.pilot_transactions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null,
  account_id uuid not null,
  description text not null,
  posted_on date not null,
  amount numeric not null,
  currency text,
  foreign key (account_id, item_id, user_id)
    references public.pilot_accounts(id, item_id, user_id) on delete cascade
);
create index pilot_tx_user_date_idx on public.pilot_transactions(user_id, posted_on desc);
create index pilot_tx_account_idx on public.pilot_transactions(account_id);

create table public.pilot_bills (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null,
  account_id uuid not null,
  due_on date not null,
  amount numeric not null,
  currency text,
  foreign key (account_id, item_id, user_id)
    references public.pilot_accounts(id, item_id, user_id) on delete cascade
);
create index pilot_bills_user_date_idx on public.pilot_bills(user_id, due_on desc);
create index pilot_bills_account_idx on public.pilot_bills(account_id);

create table public.pilot_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null,
  kind text not null,
  received_at timestamptz not null default now(),
  foreign key (item_id, user_id) references public.pilot_items(id, user_id) on delete cascade
);

create table public.pilot_queue (
  item_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('sync','remove')),
  generation bigint not null default 1,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  foreign key (item_id, user_id) references public.pilot_items(id, user_id) on delete cascade
);
create index pilot_queue_available_idx on public.pilot_queue(available_at);

alter table public.pilot_consents enable row level security;
alter table public.pilot_items enable row level security;
alter table public.pilot_accounts enable row level security;
alter table public.pilot_transactions enable row level security;
alter table public.pilot_bills enable row level security;
alter table public.pilot_events enable row level security;
alter table public.pilot_queue enable row level security;

revoke all on public.pilot_consents, public.pilot_items, public.pilot_accounts, public.pilot_transactions,
  public.pilot_bills, public.pilot_events, public.pilot_queue from public, anon, authenticated, service_role;
grant select (user_id, version, accepted_at, expires_at, revoked_at) on public.pilot_consents to authenticated;
grant select, insert, update, delete on public.pilot_consents, public.pilot_items, public.pilot_accounts,
  public.pilot_transactions, public.pilot_bills, public.pilot_events, public.pilot_queue to service_role;
grant select on public.pilot_items, public.pilot_accounts, public.pilot_transactions, public.pilot_bills to authenticated;

create policy pilot_consent_own on public.pilot_consents for select to authenticated using (user_id = (select auth.uid()));
create policy pilot_items_own on public.pilot_items for select to authenticated using (user_id = (select auth.uid()));
create policy pilot_accounts_own on public.pilot_accounts for select to authenticated using (
  user_id = (select auth.uid()) and exists (
    select 1 from public.pilot_consents c where c.user_id = (select auth.uid()) and c.revoked_at is null and c.expires_at > now()));
create policy pilot_tx_own on public.pilot_transactions for select to authenticated using (
  user_id = (select auth.uid()) and exists (
    select 1 from public.pilot_consents c where c.user_id = (select auth.uid()) and c.revoked_at is null and c.expires_at > now()));
create policy pilot_bills_own on public.pilot_bills for select to authenticated using (
  user_id = (select auth.uid()) and exists (
    select 1 from public.pilot_consents c where c.user_id = (select auth.uid()) and c.revoked_at is null and c.expires_at > now()));

create function public.pilot_open_attempt(p_user uuid)
returns boolean language plpgsql set search_path = '' as $$
begin
  update public.pilot_consents set connect_until = least(expires_at, now() + interval '30 minutes')
    where user_id = p_user and revoked_at is null and expires_at > now();
  return found;
end $$;

-- The callback can register only an Item already verified against the provider.
-- Both callback and webhook serialize with revocation on the consent row.
create function public.pilot_notify(p_user uuid, p_item uuid, p_name text, p_event uuid, p_kind text)
returns boolean language plpgsql set search_path = '' as $$
declare
  consent public.pilot_consents;
  item public.pilot_items;
begin
  select * into consent from public.pilot_consents where user_id = p_user for update;
  if not found or consent.revoked_at is not null or consent.expires_at <= now() then return false; end if;

  select * into item from public.pilot_items where id = p_item for update;
  if not found then
    if p_name is null or consent.connect_until is null or consent.connect_until < now() then return false; end if;
    insert into public.pilot_items(id,user_id,name) values (p_item,p_user,p_name) on conflict (id) do nothing;
    select * into item from public.pilot_items where id = p_item for update;
  end if;
  if item.user_id <> p_user or item.state in ('disconnecting','disconnected') then return false; end if;

  if p_event is not null then
    insert into public.pilot_events(id,user_id,item_id,kind) values (p_event,p_user,p_item,p_kind)
      on conflict (id) do nothing;
    if not found then return true; end if;
  end if;

  insert into public.pilot_queue(item_id,user_id,kind) values (p_item,p_user,'sync')
    on conflict (item_id) do update set generation = public.pilot_queue.generation + 1
    where public.pilot_queue.kind = 'sync';
  return true;
end $$;

create function public.pilot_disconnect(p_user uuid, p_item uuid)
returns integer language plpgsql set search_path = '' as $$
declare
  selected_item uuid;
  changed integer := 0;
begin
  perform 1 from public.pilot_consents where user_id = p_user for update;
  if p_item is null then
    update public.pilot_consents set revoked_at = coalesce(revoked_at,now()), connect_until = null
      where user_id = p_user;
  end if;
  for selected_item in
    select id from public.pilot_items where user_id = p_user and (p_item is null or id = p_item)
      and state not in ('disconnecting','disconnected') order by id for update
  loop
    delete from public.pilot_accounts where item_id = selected_item and user_id = p_user;
    delete from public.pilot_events where item_id = selected_item and user_id = p_user;
    update public.pilot_items set state = 'disconnecting', name = 'Conexão removida', last_complete = null
      where id = selected_item and user_id = p_user;
    insert into public.pilot_queue(item_id,user_id,kind) values (selected_item,p_user,'remove')
      on conflict (item_id) do update set kind = 'remove', generation = public.pilot_queue.generation + 1,
        attempts = 0, available_at = now(), lease_id = null, lease_until = null;
    changed := changed + 1;
  end loop;
  return changed;
end $$;

create function public.pilot_reconcile()
returns void language plpgsql set search_path = '' as $$
declare
  owner_id uuid;
begin
  for owner_id in select user_id from public.pilot_consents where revoked_at is null and expires_at <= now()
  loop
    perform public.pilot_disconnect(owner_id,null);
  end loop;
  delete from public.pilot_events where received_at < now() - interval '15 days';
  delete from public.pilot_transactions where posted_on < current_date - 90;
  insert into public.pilot_queue(item_id,user_id,kind)
    select i.id,i.user_id,'sync' from public.pilot_items i join public.pilot_consents c using (user_id)
      where c.revoked_at is null and c.expires_at > now() and i.state not in ('disconnecting','disconnected')
        and (i.last_checked is null or i.last_checked < now() - interval '1 day')
    on conflict (item_id) do nothing;
end $$;

create function public.pilot_claim()
returns setof public.pilot_queue language sql set search_path = '' as $$
  with next as (
    select q.item_id from public.pilot_queue q join public.pilot_consents c using (user_id)
    where (q.kind = 'remove' or (c.revoked_at is null and c.expires_at > now()))
      and q.available_at <= now() and (q.lease_until is null or q.lease_until <= now())
    order by (q.kind = 'remove') desc,q.available_at,q.item_id
    for update of q skip locked limit 1
  )
  update public.pilot_queue q set lease_id = gen_random_uuid(), lease_until = now() + interval '3 minutes',
    attempts = attempts + 1 from next where q.item_id = next.item_id returning q.*;
$$;

create function public.pilot_finish(p_item uuid, p_lease uuid, p_version bigint, p_state text,
  p_retry_seconds integer, p_snapshot jsonb)
returns boolean language plpgsql set search_path = '' as $$
declare
  item public.pilot_items;
  job public.pilot_queue;
  consent public.pilot_consents;
begin
  select * into item from public.pilot_items where id = p_item;
  if not found then return false; end if;
  select * into consent from public.pilot_consents where user_id = item.user_id for update;
  select * into item from public.pilot_items where id = p_item for update;
  if not found then return false; end if;
  select * into job from public.pilot_queue where item_id = p_item and lease_id = p_lease for update;
  if not found or job.lease_until <= now() then return false; end if;
  if job.kind = 'sync' and (consent.revoked_at is not null or consent.expires_at <= now()) then return false; end if;

  if p_snapshot is not null then
    insert into public.pilot_accounts as a (id,user_id,item_id,name,kind,balance,currency)
      select x.id,item.user_id,p_item,x.name,x.kind,x.balance,x.currency
      from jsonb_to_recordset(p_snapshot->'accounts') x(id uuid,name text,kind text,balance numeric,currency text)
      on conflict (id) do update set name = excluded.name,kind = excluded.kind,balance = excluded.balance,
        currency = excluded.currency where a.user_id = item.user_id and a.item_id = p_item;

    insert into public.pilot_transactions as t (id,user_id,item_id,account_id,description,posted_on,amount,currency)
      select x.id,item.user_id,p_item,x.account_id,x.description,x.posted_on,x.amount,x.currency
      from jsonb_to_recordset(p_snapshot->'transactions')
        x(id uuid,account_id uuid,description text,posted_on date,amount numeric,currency text)
      on conflict (id) do update set description = excluded.description,posted_on = excluded.posted_on,
        amount = excluded.amount,currency = excluded.currency
      where t.user_id = item.user_id and t.item_id = p_item and t.account_id = excluded.account_id;

    insert into public.pilot_bills as b (id,user_id,item_id,account_id,due_on,amount,currency)
      select x.id,item.user_id,p_item,x.account_id,x.due_on,x.amount,x.currency
      from jsonb_to_recordset(p_snapshot->'bills') x(id uuid,account_id uuid,due_on date,amount numeric,currency text)
      on conflict (id) do update set due_on = excluded.due_on,amount = excluded.amount,currency = excluded.currency
      where b.user_id = item.user_id and b.item_id = p_item and b.account_id = excluded.account_id;

    if p_state = 'updated' then
      delete from public.pilot_transactions t where t.item_id = p_item and t.user_id = item.user_id
        and not exists (select 1 from jsonb_array_elements(p_snapshot->'transactions') x where (x->>'id')::uuid = t.id);
      delete from public.pilot_bills b where b.item_id = p_item and b.user_id = item.user_id
        and not exists (select 1 from jsonb_array_elements(p_snapshot->'bills') x where (x->>'id')::uuid = b.id);
      delete from public.pilot_accounts a where a.item_id = p_item and a.user_id = item.user_id
        and not exists (select 1 from jsonb_array_elements(p_snapshot->'accounts') x where (x->>'id')::uuid = a.id);
    end if;
  end if;

  if p_state = 'disconnected' then
    delete from public.pilot_accounts where item_id = p_item and user_id = item.user_id;
    delete from public.pilot_events where item_id = p_item and user_id = item.user_id;
  end if;
  update public.pilot_items set state = p_state,last_checked = now(),
    name = case when p_state = 'disconnected' then 'Conexão removida' else name end,
    last_complete = case when p_state = 'updated' then now()
      when p_state = 'disconnected' then null else last_complete end
    where id = p_item;

  if p_retry_seconds is not null or job.generation <> p_version then
    update public.pilot_queue set lease_id = null, lease_until = null,
      available_at = now() + make_interval(secs => coalesce(p_retry_seconds,0)),
      attempts = case when p_retry_seconds is null then 0 else attempts end
      where item_id = p_item;
  else
    delete from public.pilot_queue where item_id = p_item;
  end if;
  return true;
end $$;

revoke execute on function public.pilot_open_attempt(uuid), public.pilot_notify(uuid,uuid,text,uuid,text),
  public.pilot_disconnect(uuid,uuid), public.pilot_reconcile(), public.pilot_claim(),
  public.pilot_finish(uuid,uuid,bigint,text,integer,jsonb) from public, anon, authenticated;
grant execute on function public.pilot_open_attempt(uuid), public.pilot_notify(uuid,uuid,text,uuid,text),
  public.pilot_disconnect(uuid,uuid), public.pilot_reconcile(), public.pilot_claim(),
  public.pilot_finish(uuid,uuid,bigint,text,integer,jsonb) to service_role;
