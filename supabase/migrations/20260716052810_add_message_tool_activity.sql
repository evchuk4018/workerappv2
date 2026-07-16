alter table public.messages
  add column tool_activity jsonb not null default '[]'::jsonb
  check (jsonb_typeof(tool_activity) = 'array');

comment on column public.messages.tool_activity is
  'Compact web tool metadata for the assistant UI; fetched page content is never stored here.';
