begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

select has_table('public', 'agent_runs', 'resumable agent run table exists');
select has_table('public', 'chat_files', 'chat file metadata table exists');

select ok((select relrowsecurity from pg_class where oid = 'public.agent_runs'::regclass),
  'agent runs have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.chat_files'::regclass),
  'chat files have RLS');

select ok(exists(
  select 1 from pg_constraint
  where conrelid = 'public.messages'::regclass
    and conname = 'messages_status_check'
    and pg_get_constraintdef(oid) like '%awaiting_tool%'
), 'messages allow the awaiting_tool status');

select ok(exists(
  select 1 from storage.buckets where id = 'chat-files'
), 'private chat-files bucket exists');
select ok(not (select public from storage.buckets where id = 'chat-files'),
  'chat-files bucket is private');
select is((select file_size_limit from storage.buckets where id = 'chat-files'), 26214400::bigint,
  'bucket accepts inputs up to 25 MiB');

select ok(not has_table_privilege('anon', 'public.agent_runs', 'select'),
  'anonymous users cannot read agent runs');
select ok(not has_table_privilege('anon', 'public.chat_files', 'select'),
  'anonymous users cannot read chat files');
select ok(has_table_privilege('authenticated', 'public.agent_runs', 'select'),
  'authenticated users can select agent runs through RLS');
select ok(has_table_privilege('authenticated', 'public.agent_runs', 'insert'),
  'authenticated users can insert agent runs through RLS');
select ok(has_table_privilege('authenticated', 'public.agent_runs', 'update'),
  'authenticated users can update agent runs through RLS');
select ok(has_table_privilege('authenticated', 'public.agent_runs', 'delete'),
  'authenticated users can delete agent runs through RLS');
select ok(has_table_privilege('authenticated', 'public.chat_files', 'select'),
  'authenticated users can select chat files through RLS');
select ok(has_table_privilege('authenticated', 'public.chat_files', 'insert'),
  'authenticated users can insert chat files through RLS');
select ok(has_table_privilege('authenticated', 'public.chat_files', 'update'),
  'authenticated users can update chat files through RLS');
select ok(has_table_privilege('authenticated', 'public.chat_files', 'delete'),
  'authenticated users can delete chat files through RLS');
select ok(not has_table_privilege('authenticated', 'public.chat_files', 'truncate'),
  'authenticated users do not receive table-owner privileges');

select is((select count(*)::integer from pg_policies
  where schemaname = 'public' and tablename = 'agent_runs'), 4,
  'agent runs have four ownership policies');
select is((select count(*)::integer from pg_policies
  where schemaname = 'public' and tablename = 'chat_files'), 4,
  'chat files have four ownership policies');
select is((select count(*)::integer from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'Users can % their chat file objects'), 4,
  'chat-files objects have four operation policies');
select is((select count(*)::integer from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'Users can % their chat file objects'
    and coalesce(qual, with_check) like '%foldername%auth.uid%'), 4,
  'every chat-files object policy scopes paths to auth.uid');

select has_index('public', 'agent_runs', 'agent_runs_user_status_updated_idx',
  'pending run lookup is indexed');
select has_index('public', 'agent_runs', 'agent_runs_conversation_updated_idx',
  'conversation run lookup is indexed');
select has_index('public', 'agent_runs', 'agent_runs_active_lease_idx',
  'active lease lookup is indexed');
select has_index('public', 'chat_files', 'chat_files_conversation_created_idx',
  'conversation file lookup is indexed');
select has_index('public', 'chat_files', 'chat_files_user_created_idx',
  'chat file ownership lookups are indexed');

select ok(exists(select 1 from pg_constraint
  where conrelid = 'public.chat_files'::regclass
    and conname = 'chat_files_size_limit'), 'file sizes are constrained');
select ok(exists(select 1 from pg_constraint
  where conrelid = 'public.agent_runs'::regclass
    and conname = 'agent_runs_pending_call_pair'), 'pending call fields are paired');
select ok(exists(select 1 from pg_constraint
  where conrelid = 'public.agent_runs'::regclass
    and conname = 'agent_runs_lease_pair'), 'lease fields are paired');
select ok(exists(select 1 from pg_constraint
  where conrelid = 'public.chat_files'::regclass
    and conname = 'chat_files_call_token_kind'), 'artifacts are bound to a Python call token');
select ok(exists(select 1 from pg_constraint
  where conrelid = 'public.chat_files'::regclass
    and contype = 'u' and pg_get_constraintdef(oid) like '%call_index%'),
  'artifact slots are unique per Python call');
select has_function('public', 'persist_agent_run_transition', array[
  'uuid', 'uuid', 'integer', 'text', 'jsonb', 'jsonb', 'uuid', 'text', 'text',
  'jsonb', 'jsonb', 'text', 'integer', 'smallint', 'smallint', 'text'
], 'fenced run and message transition function exists');
select has_function('public', 'stop_agent_run', array[
  'uuid', 'text', 'text', 'jsonb', 'jsonb', 'integer'
], 'atomic stop transition function exists');
select ok(exists(select 1 from pg_trigger
  where tgrelid = 'public.agent_runs'::regclass
    and tgname = 'agent_runs_set_updated_at' and not tgisinternal),
  'agent run updates refresh updated_at');

select * from finish();
rollback;
