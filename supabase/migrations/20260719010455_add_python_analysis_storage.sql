alter table public.messages
  drop constraint if exists messages_status_check;

alter table public.messages
  add constraint messages_status_check
  check (status in ('streaming', 'awaiting_tool', 'completed', 'stopped', 'error'));

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  user_message_id uuid not null,
  assistant_message_id uuid,
  status text not null default 'ready'
    check (status in ('uploading', 'ready', 'streaming', 'awaiting_python', 'completed', 'stopped', 'error')),
  provider_state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provider_state) = 'object'),
  pending_tool_call jsonb
    check (pending_tool_call is null or jsonb_typeof(pending_tool_call) = 'object'),
  pending_call_token uuid,
  version integer not null default 0 check (version >= 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  tool_round_count smallint not null default 0 check (tool_round_count between 0 and 5),
  python_execution_count smallint not null default 0 check (python_execution_count between 0 and 3),
  error text check (error is null or char_length(error) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint agent_runs_conversation_owner_fk
    foreign key (conversation_id, user_id)
    references public.conversations(id, user_id) on delete cascade,
  constraint agent_runs_user_message_fk
    foreign key (user_message_id, conversation_id)
    references public.messages(id, conversation_id) on delete cascade,
  constraint agent_runs_assistant_message_fk
    foreign key (assistant_message_id, conversation_id)
    references public.messages(id, conversation_id) on delete set null (assistant_message_id),
  constraint agent_runs_pending_call_pair check (
    (pending_tool_call is null) = (pending_call_token is null)
  ),
  constraint agent_runs_lease_pair check (
    (lease_token is null) = (lease_expires_at is null)
  ),
  unique (id, conversation_id, user_id),
  unique (user_message_id),
  unique (assistant_message_id)
);

create table public.chat_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  message_id uuid,
  agent_run_id uuid,
  call_token uuid,
  call_index smallint,
  kind text not null check (kind in ('input', 'artifact')),
  bucket_id text not null default 'chat-files' check (bucket_id = 'chat-files'),
  object_path text not null,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null check (char_length(mime_type) between 1 and 255),
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  constraint chat_files_conversation_owner_fk
    foreign key (conversation_id, user_id)
    references public.conversations(id, user_id) on delete cascade,
  constraint chat_files_message_fk
    foreign key (message_id, conversation_id)
    references public.messages(id, conversation_id) on delete set null (message_id),
  constraint chat_files_agent_run_fk
    foreign key (agent_run_id, conversation_id, user_id)
    references public.agent_runs(id, conversation_id, user_id) on delete set null (agent_run_id),
  constraint chat_files_call_token_kind check (
    (kind = 'input' and call_token is null and call_index is null)
    or (kind = 'artifact' and call_token is not null and call_index between 0 and 4)
  ),
  constraint chat_files_object_owner check (
    object_path like user_id::text || '/%'
    and char_length(object_path) between 38 and 1024
  ),
  constraint chat_files_size_limit check (
    (kind = 'input' and size_bytes between 1 and 26214400)
    or (kind = 'artifact' and size_bytes between 1 and 10485760)
  ),
  unique (agent_run_id, call_token, call_index),
  unique (bucket_id, object_path)
);

create index agent_runs_user_status_updated_idx
  on public.agent_runs (user_id, status, updated_at desc);
create index agent_runs_conversation_updated_idx
  on public.agent_runs (conversation_id, updated_at desc);
create index agent_runs_active_lease_idx
  on public.agent_runs (lease_expires_at)
  where lease_expires_at is not null;
create index chat_files_conversation_created_idx
  on public.chat_files (conversation_id, created_at);
create index chat_files_user_created_idx
  on public.chat_files (user_id, created_at desc);
create index chat_files_message_idx
  on public.chat_files (message_id) where message_id is not null;
create index chat_files_agent_run_idx
  on public.chat_files (agent_run_id) where agent_run_id is not null;
create index chat_files_call_token_idx
  on public.chat_files (agent_run_id, call_token) where call_token is not null;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger agent_runs_set_updated_at
before update on public.agent_runs
for each row execute function private.set_updated_at();

alter table public.agent_runs enable row level security;
alter table public.chat_files enable row level security;

create policy "Users can read their agent runs"
on public.agent_runs for select to authenticated
using (
  (select auth.uid()) = user_id
  and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'erholovachuk@gmail.com'
);

create policy "Users can create their agent runs"
on public.agent_runs for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'erholovachuk@gmail.com'
);

create policy "Users can update their agent runs"
on public.agent_runs for update to authenticated
using (
  (select auth.uid()) = user_id
  and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'erholovachuk@gmail.com'
)
with check (
  (select auth.uid()) = user_id
  and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'erholovachuk@gmail.com'
);

create policy "Users can delete their agent runs"
on public.agent_runs for delete to authenticated
using (
  (select auth.uid()) = user_id
  and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'erholovachuk@gmail.com'
);

create policy "Users can read their chat files"
on public.chat_files for select to authenticated
using (
  (select auth.uid()) = user_id
  and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'erholovachuk@gmail.com'
);

create policy "Users can create their chat files"
on public.chat_files for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'erholovachuk@gmail.com'
);

create policy "Users can update their chat files"
on public.chat_files for update to authenticated
using (
  (select auth.uid()) = user_id
  and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'erholovachuk@gmail.com'
)
with check (
  (select auth.uid()) = user_id
  and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'erholovachuk@gmail.com'
);

create policy "Users can delete their chat files"
on public.chat_files for delete to authenticated
using (
  (select auth.uid()) = user_id
  and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'erholovachuk@gmail.com'
);

revoke all on table public.agent_runs, public.chat_files from public, anon, authenticated;
grant select, insert, update, delete on table public.agent_runs, public.chat_files to authenticated;
grant all on table public.agent_runs, public.chat_files to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files', 'chat-files', false, 26214400)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit;

create policy "Users can read their chat file objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'erholovachuk@gmail.com'
);

create policy "Users can upload their chat file objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'erholovachuk@gmail.com'
  and exists (
    select 1 from public.chat_files f
    where f.bucket_id = 'chat-files' and f.object_path = name and f.user_id = (select auth.uid())
  )
);

create policy "Users can update their chat file objects"
on storage.objects for update to authenticated
using (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'erholovachuk@gmail.com'
)
with check (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'erholovachuk@gmail.com'
  and exists (
    select 1 from public.chat_files f
    where f.bucket_id = 'chat-files' and f.object_path = name and f.user_id = (select auth.uid())
  )
);

create policy "Users can delete their chat file objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'erholovachuk@gmail.com'
);

comment on table public.agent_runs is
  'Resumable DeepSeek agent turns, including pending browser Python tool calls and leases.';
comment on table public.chat_files is
  'Private metadata for chat inputs and generated Python artifacts stored in chat-files.';
