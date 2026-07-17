alter table public.user_settings
  add column saved_memory_enabled boolean not null default true,
  add column previous_conversations_enabled boolean not null default true,
  add column inferred_memory_enabled boolean not null default true,
  add column memory_write_mode text not null default 'read_write'
    check (memory_write_mode in ('read_write', 'read_only')),
  add column memory_started_at timestamptz not null default now();

alter table public.conversations
  add column memory_mode text not null default 'normal'
    check (memory_mode in ('normal', 'off'));

alter table public.conversations add constraint conversations_id_user_unique unique (id, user_id);
alter table public.messages add constraint messages_id_conversation_unique unique (id, conversation_id);

create table public.user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_content text,
  memory_type text not null check (memory_type in (
    'instruction','preference','fact','goal','constraint','project','relationship','event','temporary'
  )),
  dedup_key_hash text not null check (dedup_key_hash ~ '^[0-9a-f]{64}$'),
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  salience numeric(4,3) not null default 0.5 check (salience between 0 and 1),
  usefulness numeric(4,3) not null default 0.5 check (usefulness between 0 and 1),
  origin text not null check (origin in ('explicit','inferred','manual')),
  pinned boolean not null default false,
  state text not null default 'active' check (state in (
    'active','pending_review','superseded','expired','deleted'
  )),
  valid_from timestamptz,
  valid_until timestamptz,
  confirmed_at timestamptz,
  last_used_at timestamptz,
  use_count integer not null default 0 check (use_count >= 0),
  supersedes_memory_id uuid references public.user_memories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(canonical_content, ''))
  ) stored,
  constraint user_memories_content_state check (
    (state = 'deleted' and canonical_content is null and deleted_at is not null) or
    (state <> 'deleted' and deleted_at is null and char_length(canonical_content) between 1 and 2000)
  ),
  constraint user_memories_validity check (valid_until is null or valid_from is null or valid_until > valid_from),
  unique (id, user_id)
);

create unique index user_memories_live_dedup_idx
  on public.user_memories (user_id, dedup_key_hash)
  where state in ('active','pending_review');
create index user_memories_user_state_idx on public.user_memories (user_id, state, updated_at desc);
create index user_memories_supersedes_idx on public.user_memories (supersedes_memory_id)
  where supersedes_memory_id is not null;
create index user_memories_search_idx on public.user_memories using gin (search_vector);

create table public.memory_sources (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null,
  user_id uuid not null,
  conversation_id uuid not null,
  message_id uuid not null,
  source_kind text not null check (source_kind in ('created','confirmed','corrected','forgotten')),
  created_at timestamptz not null default now(),
  foreign key (memory_id, user_id) references public.user_memories(id, user_id) on delete cascade,
  foreign key (conversation_id, user_id) references public.conversations(id, user_id) on delete cascade,
  foreign key (message_id, conversation_id) references public.messages(id, conversation_id) on delete cascade,
  unique (memory_id, message_id, source_kind)
);
create index memory_sources_user_idx on public.memory_sources (user_id, created_at desc);
create index memory_sources_conversation_idx on public.memory_sources (conversation_id);
create index memory_sources_message_idx on public.memory_sources (message_id);

create table public.conversation_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'active' check (status in ('active','superseded','invalidated')),
  summary_text text not null check (char_length(summary_text) between 1 and 12000),
  structured_content jsonb not null default '{}'::jsonb check (jsonb_typeof(structured_content) = 'object'),
  through_message_id uuid references public.messages(id) on delete set null,
  input_hash text not null,
  created_at timestamptz not null default now(),
  invalidated_at timestamptz,
  search_vector tsvector generated always as (to_tsvector('simple', summary_text)) stored,
  unique (conversation_id, version),
  unique (id, user_id)
);
create unique index conversation_summaries_active_idx on public.conversation_summaries (conversation_id)
  where status = 'active';
create index conversation_summaries_user_idx on public.conversation_summaries (user_id, created_at desc);
create index conversation_summaries_conversation_idx on public.conversation_summaries (conversation_id);
create index conversation_summaries_search_idx on public.conversation_summaries using gin (search_vector);

create table public.memory_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'candidate' check (status in ('candidate','active','rejected','rolled_back','invalidated')),
  profile_text text not null check (char_length(profile_text) <= 8000),
  profile_json jsonb not null default '[]'::jsonb check (jsonb_typeof(profile_json) = 'array'),
  token_estimate integer not null check (token_estimate between 0 and 600),
  based_on_profile_id uuid references public.memory_profiles(id) on delete set null,
  trigger_reason text not null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  unique (user_id, version),
  unique (id, user_id)
);
create unique index memory_profiles_active_idx on public.memory_profiles (user_id) where status = 'active';
create index memory_profiles_user_idx on public.memory_profiles (user_id, created_at desc);
create index memory_profiles_based_on_idx on public.memory_profiles (based_on_profile_id)
  where based_on_profile_id is not null;

create table public.memory_profile_sources (
  profile_id uuid not null,
  memory_id uuid not null,
  user_id uuid not null,
  claim_index integer not null check (claim_index >= 0),
  summary_id uuid,
  primary key (profile_id, memory_id, claim_index),
  foreign key (profile_id, user_id) references public.memory_profiles(id, user_id) on delete cascade,
  foreign key (memory_id, user_id) references public.user_memories(id, user_id) on delete cascade,
  foreign key (summary_id, user_id) references public.conversation_summaries(id, user_id) on delete set null
);
create index memory_profile_sources_memory_idx on public.memory_profile_sources (memory_id);
create index memory_profile_sources_summary_idx on public.memory_profile_sources (summary_id)
  where summary_id is not null;

create table public.memory_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_id uuid references public.user_memories(id) on delete set null,
  action text not null check (action in (
    'created','confirmed','superseded','expired','deleted','edited','pinned','unpinned','reviewed','profile_activated','profile_rolled_back'
  )),
  actor text not null check (actor in ('user','worker','system')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index memory_events_user_idx on public.memory_events (user_id, created_at desc);
create index memory_events_memory_idx on public.memory_events (memory_id) where memory_id is not null;

create table public.memory_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  proposed_content text check (proposed_content is null or char_length(proposed_content) <= 2000),
  memory_type text,
  confidence numeric(4,3) check (confidence between 0 and 1),
  reason text not null,
  state text not null default 'pending' check (state in ('pending','accepted','rejected')),
  related_memory_id uuid references public.user_memories(id) on delete set null,
  source_conversation_id uuid references public.conversations(id) on delete cascade,
  source_message_id uuid references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index memory_reviews_user_pending_idx on public.memory_reviews (user_id, created_at desc) where state = 'pending';
create index memory_reviews_related_idx on public.memory_reviews (related_memory_id)
  where related_memory_id is not null;

create table public.conversation_memory_state (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  processing_started_at timestamptz not null default now(),
  last_extracted_message_id uuid references public.messages(id) on delete set null,
  last_summarized_message_id uuid references public.messages(id) on delete set null,
  unprocessed_user_turns integer not null default 0 check (unprocessed_user_turns >= 0),
  memory_changes_since_dream integer not null default 0 check (memory_changes_since_dream >= 0),
  summary_changes_since_dream integer not null default 0 check (summary_changes_since_dream >= 0),
  last_dream_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);
create index conversation_memory_state_user_idx on public.conversation_memory_state (user_id, updated_at desc);

insert into public.conversation_memory_state (conversation_id, user_id)
select id, user_id from public.conversations on conflict do nothing;

alter table public.user_memories enable row level security;
alter table public.memory_sources enable row level security;
alter table public.conversation_summaries enable row level security;
alter table public.memory_profiles enable row level security;
alter table public.memory_profile_sources enable row level security;
alter table public.memory_events enable row level security;
alter table public.memory_reviews enable row level security;
alter table public.conversation_memory_state enable row level security;

create policy "Users manage their memories" on public.user_memories for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage memory sources" on public.memory_sources for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users read conversation summaries" on public.conversation_summaries for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users read memory profiles" on public.memory_profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users read profile sources" on public.memory_profile_sources for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users read memory events" on public.memory_events for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users add memory events" on public.memory_events for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users manage memory reviews" on public.memory_reviews for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users read conversation memory state" on public.conversation_memory_state for select to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update on public.user_memories to authenticated;
grant select, insert, delete on public.memory_sources to authenticated;
grant select on public.conversation_summaries, public.memory_profiles,
  public.memory_profile_sources, public.conversation_memory_state to authenticated;
grant select, insert on public.memory_events to authenticated;
grant select, insert, update on public.memory_reviews to authenticated;

revoke update on table public.conversations from authenticated;
grant update (title, title_finalized_at, updated_at, memory_mode) on table public.conversations to authenticated;
revoke update on table public.user_settings from authenticated;
grant update (system_prompt, saved_memory_enabled, previous_conversations_enabled,
  inferred_memory_enabled, memory_write_mode, updated_at) on table public.user_settings to authenticated;
