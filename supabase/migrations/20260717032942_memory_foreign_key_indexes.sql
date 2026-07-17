create index conversation_memory_state_extracted_idx
  on public.conversation_memory_state (last_extracted_message_id)
  where last_extracted_message_id is not null;
create index conversation_memory_state_summarized_idx
  on public.conversation_memory_state (last_summarized_message_id)
  where last_summarized_message_id is not null;
create index conversation_summaries_through_message_idx
  on public.conversation_summaries (through_message_id)
  where through_message_id is not null;

drop index public.memory_profile_sources_memory_idx;
drop index public.memory_profile_sources_summary_idx;
create index memory_profile_sources_memory_user_idx
  on public.memory_profile_sources (memory_id, user_id);
create index memory_profile_sources_profile_user_idx
  on public.memory_profile_sources (profile_id, user_id);
create index memory_profile_sources_summary_user_idx
  on public.memory_profile_sources (summary_id, user_id)
  where summary_id is not null;

create index memory_reviews_source_conversation_idx
  on public.memory_reviews (source_conversation_id)
  where source_conversation_id is not null;
create index memory_reviews_source_message_idx
  on public.memory_reviews (source_message_id)
  where source_message_id is not null;

drop index public.memory_sources_conversation_idx;
drop index public.memory_sources_message_idx;
create index memory_sources_conversation_user_idx
  on public.memory_sources (conversation_id, user_id);
create index memory_sources_memory_user_idx
  on public.memory_sources (memory_id, user_id);
create index memory_sources_message_conversation_idx
  on public.memory_sources (message_id, conversation_id);
