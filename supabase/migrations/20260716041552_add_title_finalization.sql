alter table public.conversations
  add column title_finalized_at timestamptz;

update public.conversations
set title_finalized_at = updated_at;

revoke update on table public.conversations from authenticated;
grant update (title, title_finalized_at, updated_at)
on table public.conversations to authenticated;
