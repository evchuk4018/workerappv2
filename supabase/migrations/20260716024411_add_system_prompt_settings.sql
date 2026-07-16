alter table public.conversations
  add column system_prompt text not null default ''
  check (char_length(system_prompt) <= 20000);

revoke update on table public.conversations from authenticated;
grant update (title, updated_at) on table public.conversations to authenticated;

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  system_prompt text not null default '' check (char_length(system_prompt) <= 20000),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "Users can read their settings"
on public.user_settings for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their settings"
on public.user_settings for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their settings"
on public.user_settings for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update on table public.user_settings to authenticated;
