alter table public.messages
  add column reasoning_blocks jsonb not null default '[]'::jsonb
  check (jsonb_typeof(reasoning_blocks) = 'array');

comment on column public.messages.reasoning_blocks is
  'Ordered reasoning rounds for the assistant UI, including per-round generation duration.';
