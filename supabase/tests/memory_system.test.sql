begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

select has_table('public', 'user_memories', 'atomic memory table exists');
select has_table('public', 'memory_sources', 'provenance table exists');
select has_table('public', 'conversation_summaries', 'summary table exists');
select has_table('public', 'memory_profiles', 'profile table exists');
select has_table('public', 'memory_reviews', 'review table exists');
select has_table('private', 'memory_jobs', 'durable job table is private');
select has_table('private', 'memory_job_runs', 'attempt table is private');

select ok((select relrowsecurity from pg_class where oid = 'public.user_memories'::regclass),
  'atomic memories have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.memory_sources'::regclass),
  'provenance has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.memory_profiles'::regclass),
  'profiles have RLS');
select ok((select relrowsecurity from pg_class where oid = 'private.memory_jobs'::regclass),
  'jobs have RLS');

select has_function('public', 'retrieve_memories', array['text','integer'], 'retrieval RPC exists');
select has_function('public', 'replace_memory',
  array['uuid','text','text','text','numeric','timestamp with time zone'],
  'copy-on-write edit RPC exists');
select has_function('private', 'claim_memory_jobs', array['integer'], 'claim routine exists');
select has_function('private', 'finish_memory_job',
  array['uuid','bigint','boolean','integer','text','jsonb','text'], 'finish routine exists');

select has_index('public', 'user_memories', 'user_memories_live_dedup_idx',
  'live atomic memory dedup is indexed');
select has_index('public', 'user_memories', 'user_memories_search_idx',
  'atomic lexical search is indexed');
select has_index('public', 'conversation_summaries', 'conversation_summaries_search_idx',
  'summary lexical search is indexed');

select ok(not has_table_privilege('anon', 'public.user_memories', 'select'),
  'anonymous users cannot read memories');
select ok(not has_table_privilege('authenticated', 'private.memory_jobs', 'select'),
  'authenticated users cannot read private jobs');
select ok(has_table_privilege('authenticated', 'public.user_memories', 'select'),
  'authenticated Data API grant is explicit');
select ok(exists(select 1 from cron.job where jobname = 'production-memory-worker'),
  'worker cron is installed');

select * from finish();
rollback;
