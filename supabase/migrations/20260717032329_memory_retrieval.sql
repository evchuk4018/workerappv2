create table public.memory_commands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  command text not null check (command in ('refresh_profile','rollback_profile')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index memory_commands_user_idx on public.memory_commands (user_id, created_at desc);
alter table public.memory_commands enable row level security;
create policy "Users create memory commands" on public.memory_commands for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users read memory commands" on public.memory_commands for select to authenticated
  using ((select auth.uid()) = user_id);
grant select, insert on public.memory_commands to authenticated;

create or replace function private.queue_memory_command()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.memory_jobs (user_id, job_type, idempotency_key, payload)
  values (
    new.user_id,
    'dream',
    'command:' || new.id::text,
    new.payload || jsonb_build_object('command_id', new.id, 'command', new.command)
  ) on conflict (idempotency_key) do nothing;
  return new;
exception when others then
  return new;
end;
$$;

create trigger memory_commands_queue_job
after insert on public.memory_commands
for each row execute function private.queue_memory_command();
revoke execute on function private.queue_memory_command() from public, anon, authenticated, service_role;

create or replace function public.retrieve_memories(
  search_query text,
  result_limit integer default 8
)
returns table (
  id uuid,
  canonical_content text,
  memory_type text,
  confidence numeric,
  salience numeric,
  usefulness numeric,
  origin text,
  pinned boolean,
  valid_from timestamptz,
  valid_until timestamptz,
  score numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with query_data as (
    select websearch_to_tsquery('simple', coalesce(search_query, '')) as query,
      lower(trim(coalesce(search_query, ''))) as raw
  ), ranked as (
    select m.*,
      greatest(
        case when q.raw = '' then 0 else ts_rank(m.search_vector, q.query, 32) end,
        case when q.raw = '' then 0 else public.similarity(lower(m.canonical_content), q.raw) end
      )::numeric as relevance,
      greatest(0, 1 - extract(epoch from (now() - m.updated_at)) / 31557600)::numeric as recency
    from public.user_memories m cross join query_data q
    where m.user_id = (select auth.uid())
      and m.state = 'active'
      and (m.valid_from is null or m.valid_from <= now())
      and (m.valid_until is null or m.valid_until > now())
      and (
        m.pinned or q.raw = '' or m.search_vector @@ q.query or
        public.similarity(lower(m.canonical_content), q.raw) >= 0.12
      )
  )
  select r.id, r.canonical_content, r.memory_type, r.confidence, r.salience,
    r.usefulness, r.origin, r.pinned, r.valid_from, r.valid_until,
    (
      0.45 * r.relevance +
      0.15 * r.salience +
      0.12 * r.confidence +
      0.10 * case when r.origin in ('explicit','manual') then 1 else 0 end +
      0.08 * r.recency +
      0.05 * r.usefulness +
      0.05
    )::numeric as score
  from ranked r
  order by r.pinned desc, score desc, r.updated_at desc
  limit greatest(1, least(result_limit, 20));
$$;

create or replace function public.retrieve_conversation_summaries(
  search_query text,
  excluded_conversation_id uuid default null,
  result_limit integer default 3
)
returns table (
  id uuid,
  conversation_id uuid,
  summary_text text,
  structured_content jsonb,
  created_at timestamptz,
  score numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with query_data as (
    select websearch_to_tsquery('simple', coalesce(search_query, '')) as query,
      lower(trim(coalesce(search_query, ''))) as raw
  )
  select s.id, s.conversation_id, s.summary_text, s.structured_content, s.created_at,
    greatest(
      ts_rank(s.search_vector, q.query, 32),
      public.similarity(lower(s.summary_text), q.raw)
    )::numeric as score
  from public.conversation_summaries s cross join query_data q
  where s.user_id = (select auth.uid())
    and s.status = 'active'
    and (excluded_conversation_id is null or s.conversation_id <> excluded_conversation_id)
    and q.raw <> ''
    and (s.search_vector @@ q.query or public.similarity(lower(s.summary_text), q.raw) >= 0.10)
  order by score desc, s.created_at desc
  limit greatest(1, least(result_limit, 10));
$$;

create or replace function public.record_memory_usage(memory_ids uuid[])
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.user_memories
  set use_count = use_count + 1, last_used_at = now()
  where user_id = (select auth.uid()) and id = any(memory_ids) and state = 'active';
$$;

create or replace function public.replace_memory(
  target_memory_id uuid,
  replacement_content text,
  replacement_type text,
  replacement_hash text,
  replacement_salience numeric,
  replacement_valid_until timestamptz default null
)
returns public.user_memories
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  prior public.user_memories;
  replacement public.user_memories;
begin
  select * into prior from public.user_memories
  where id = target_memory_id and user_id = (select auth.uid())
    and state <> 'deleted' for update;
  if prior.id is null then raise exception 'Memory not found'; end if;

  update public.user_memories set state = 'superseded', pinned = false, updated_at = now()
  where id = prior.id;
  insert into public.user_memories (
    user_id, canonical_content, memory_type, dedup_key_hash, confidence, salience,
    usefulness, origin, pinned, state, valid_until, confirmed_at,
    supersedes_memory_id, updated_at
  ) values (
    prior.user_id, replacement_content, replacement_type, replacement_hash, 1,
    replacement_salience, prior.usefulness, 'manual', prior.pinned, 'active',
    replacement_valid_until, now(), prior.id, now()
  ) returning * into replacement;
  insert into public.memory_events (user_id, memory_id, action, actor, metadata)
  values (prior.user_id, replacement.id, 'edited', 'user',
    jsonb_build_object('supersedes', prior.id));
  return replacement;
end;
$$;

revoke all on function public.retrieve_memories(text, integer) from public, anon;
revoke all on function public.retrieve_conversation_summaries(text, uuid, integer) from public, anon;
revoke all on function public.record_memory_usage(uuid[]) from public, anon;
revoke all on function public.replace_memory(uuid, text, text, text, numeric, timestamptz) from public, anon;
grant execute on function public.retrieve_memories(text, integer) to authenticated;
grant execute on function public.retrieve_conversation_summaries(text, uuid, integer) to authenticated;
grant execute on function public.record_memory_usage(uuid[]) to authenticated;
grant execute on function public.replace_memory(uuid, text, text, text, numeric, timestamptz) to authenticated;
