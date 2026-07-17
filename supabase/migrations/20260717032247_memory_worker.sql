create extension if not exists pgmq;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pgmq.list_queues() where queue_name = 'memory_jobs') then
    perform pgmq.create('memory_jobs');
  end if;
end $$;

create table private.memory_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  assistant_message_id uuid references public.messages(id) on delete cascade,
  job_type text not null check (job_type in ('exchange','summary','dream','redact')),
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'queued' check (status in (
    'queued','processing','retrying','succeeded','failed','cancelled'
  )),
  attempts integer not null default 0 check (attempts between 0 and 5),
  queue_message_id bigint,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index memory_jobs_dispatch_idx on private.memory_jobs (available_at, created_at)
  where status = 'queued' and queue_message_id is null;
create index memory_jobs_user_idx on private.memory_jobs (user_id, created_at desc);
create index memory_jobs_conversation_idx on private.memory_jobs (conversation_id)
  where conversation_id is not null;
create index memory_jobs_message_idx on private.memory_jobs (assistant_message_id)
  where assistant_message_id is not null;

create table private.memory_job_runs (
  id bigint generated always as identity primary key,
  job_id uuid not null references private.memory_jobs(id) on delete cascade,
  attempt integer not null check (attempt between 1 and 5),
  model text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  cache_hit_tokens integer check (cache_hit_tokens is null or cache_hit_tokens >= 0),
  cache_miss_tokens integer check (cache_miss_tokens is null or cache_miss_tokens >= 0),
  duration_ms integer not null check (duration_ms >= 0),
  success boolean not null,
  error_code text,
  created_at timestamptz not null default now(),
  unique (job_id, attempt)
);
create index memory_job_runs_job_idx on private.memory_job_runs (job_id, created_at desc);

alter table private.memory_jobs enable row level security;
alter table private.memory_job_runs enable row level security;
revoke all on private.memory_jobs, private.memory_job_runs from public, anon, authenticated;

create or replace function private.queue_completed_exchange()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  conversation_mode text;
  can_process boolean;
begin
  if new.role <> 'assistant' or new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  select c.user_id, c.memory_mode,
    coalesce(s.memory_write_mode = 'read_write' and
      (s.saved_memory_enabled or s.previous_conversations_enabled), true)
  into owner_id, conversation_mode, can_process
  from public.conversations c
  left join public.user_settings s on s.user_id = c.user_id
  where c.id = new.conversation_id;

  if owner_id is null or conversation_mode = 'off' or not can_process then
    return new;
  end if;

  insert into public.conversation_memory_state (conversation_id, user_id, unprocessed_user_turns, updated_at)
  values (new.conversation_id, owner_id, 1, now())
  on conflict (conversation_id) do update
    set unprocessed_user_turns = public.conversation_memory_state.unprocessed_user_turns + 1,
        updated_at = now();

  insert into private.memory_jobs (
    user_id, conversation_id, assistant_message_id, job_type, idempotency_key, payload
  ) values (
    owner_id, new.conversation_id, new.id, 'exchange', 'exchange:' || new.id::text,
    jsonb_build_object('assistant_message_id', new.id, 'conversation_id', new.conversation_id)
  ) on conflict (idempotency_key) do nothing;
  return new;
exception when others then
  -- Memory failures must never prevent the assistant response from being stored.
  raise log 'memory_exchange_enqueue_failed sqlstate=%', sqlstate;
  return new;
end;
$$;

create trigger messages_queue_memory_exchange
after update of status on public.messages
for each row execute function private.queue_completed_exchange();

create or replace function private.propagate_memory_forget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_conversations uuid[];
begin
  if new.state <> 'deleted' or old.state = 'deleted' then return new; end if;
  select coalesce(array_agg(distinct conversation_id), array[]::uuid[])
    into source_conversations from public.memory_sources where memory_id = new.id;

  update public.memory_profiles p set status = 'invalidated'
  where p.user_id = new.user_id and p.status = 'active'
    and exists (select 1 from public.memory_profile_sources ps
      where ps.profile_id = p.id and ps.memory_id = new.id);
  update public.conversation_summaries set status = 'invalidated', invalidated_at = now()
  where user_id = new.user_id and status = 'active' and conversation_id = any(source_conversations);
  update public.conversation_memory_state set last_summarized_message_id = null, updated_at = now()
  where user_id = new.user_id and conversation_id = any(source_conversations);
  delete from public.memory_sources where memory_id = new.id;
  insert into public.memory_events (user_id, memory_id, action, actor)
    values (new.user_id, new.id, 'deleted', 'system');
  insert into private.memory_jobs (user_id, job_type, idempotency_key, payload)
    values (new.user_id, 'redact', 'redact:' || new.id::text,
      jsonb_build_object('memory_id', new.id, 'conversation_ids', source_conversations))
    on conflict (idempotency_key) do nothing;
  return new;
end;
$$;

create trigger user_memories_propagate_forget
after update of state on public.user_memories
for each row execute function private.propagate_memory_forget();

create or replace function private.dispatch_memory_jobs(batch_size integer default 20)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  job record;
  message_id bigint;
  dispatched integer := 0;
begin
  for job in
    select id from private.memory_jobs
    where status = 'queued' and queue_message_id is null and available_at <= now()
    order by created_at
    limit greatest(1, least(batch_size, 100))
    for update skip locked
  loop
    select send into message_id
    from pgmq.send('memory_jobs', jsonb_build_object('job_id', job.id));
    update private.memory_jobs
      set queue_message_id = message_id, updated_at = now()
      where id = job.id;
    dispatched := dispatched + 1;
  end loop;
  return dispatched;
end;
$$;

create or replace function private.claim_memory_jobs(batch_size integer default 5)
returns table (
  job_id uuid, user_id uuid, conversation_id uuid, assistant_message_id uuid,
  job_type text, job_payload jsonb, queue_message_id bigint, attempt integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with queue_messages as (
    select * from pgmq.read('memory_jobs', 180, greatest(1, least(batch_size, 10)))
  ), claimed as (
    update private.memory_jobs j
    set status = 'processing', attempts = j.attempts + 1,
        locked_at = now(), updated_at = now()
    from queue_messages q
    where j.id = (q.message->>'job_id')::uuid
      and j.status in ('queued','processing','retrying') and j.attempts < 5
    returning j.*, q.msg_id
  )
  select c.id, c.user_id, c.conversation_id, c.assistant_message_id,
    c.job_type, c.payload, c.msg_id, c.attempts
  from claimed c;
end;
$$;

create or replace function private.finish_memory_job(
  target_job_id uuid,
  target_queue_message_id bigint,
  was_successful boolean,
  run_duration_ms integer,
  run_model text default null,
  run_usage jsonb default '{}'::jsonb,
  run_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_attempt integer;
  retry_seconds integer;
begin
  select attempts into current_attempt from private.memory_jobs where id = target_job_id for update;
  if current_attempt is null then raise exception 'Unknown memory job'; end if;

  insert into private.memory_job_runs (
    job_id, attempt, model, input_tokens, output_tokens, cache_hit_tokens,
    cache_miss_tokens, duration_ms, success, error_code
  ) values (
    target_job_id, current_attempt, run_model,
    nullif(run_usage->>'input_tokens','')::integer,
    nullif(run_usage->>'output_tokens','')::integer,
    nullif(run_usage->>'cache_hit_tokens','')::integer,
    nullif(run_usage->>'cache_miss_tokens','')::integer,
    greatest(run_duration_ms, 0), was_successful, left(run_error_code, 80)
  ) on conflict (job_id, attempt) do nothing;

  if was_successful then
    update private.memory_jobs set status = 'succeeded', completed_at = now(),
      locked_at = null, last_error = null, updated_at = now() where id = target_job_id;
    perform pgmq.archive('memory_jobs', target_queue_message_id);
  elsif current_attempt >= 5 then
    update private.memory_jobs set status = 'failed', completed_at = now(),
      locked_at = null, last_error = left(run_error_code, 80), updated_at = now()
      where id = target_job_id;
    perform pgmq.archive('memory_jobs', target_queue_message_id);
  else
    retry_seconds := least(30 * (2 ^ greatest(current_attempt - 1, 0)), 3600);
    update private.memory_jobs set status = 'retrying', locked_at = null,
      last_error = left(run_error_code, 80), updated_at = now() where id = target_job_id;
    perform pgmq.set_vt('memory_jobs', target_queue_message_id, retry_seconds);
  end if;
end;
$$;

create or replace function private.tick_memory_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_url text;
  worker_secret text;
begin
  perform private.dispatch_memory_jobs(20);
  if not exists (select 1 from private.memory_jobs where status in ('queued','retrying','processing')) then
    return;
  end if;
  select decrypted_secret into worker_url from vault.decrypted_secrets where name = 'memory_worker_url';
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name = 'memory_worker_secret';
  if worker_url is null or worker_secret is null then return; end if;
  perform net.http_post(
    url := worker_url,
    headers := jsonb_build_object('Content-Type','application/json','x-memory-worker-secret',worker_secret),
    body := jsonb_build_object('source','cron'),
    timeout_milliseconds := 150000
  );
exception when others then
  return;
end;
$$;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'production-memory-worker') then
    perform cron.unschedule('production-memory-worker');
  end if;
  perform cron.schedule('production-memory-worker', '10 seconds',
    'select private.tick_memory_worker()');
end $$;

revoke execute on all functions in schema private from public, anon, authenticated, service_role;
