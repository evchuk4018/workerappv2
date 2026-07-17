revoke all on table
  public.user_memories,
  public.memory_sources,
  public.conversation_summaries,
  public.memory_profiles,
  public.memory_profile_sources,
  public.memory_events,
  public.memory_reviews,
  public.conversation_memory_state,
  public.memory_commands
from public, anon;

grant select, insert, update on public.user_memories to authenticated;
grant select, insert, delete on public.memory_sources to authenticated;
grant select on public.conversation_summaries, public.memory_profiles,
  public.memory_profile_sources, public.conversation_memory_state to authenticated;
grant select, insert on public.memory_events to authenticated;
grant select, insert, update on public.memory_reviews to authenticated;
grant select, insert on public.memory_commands to authenticated;
