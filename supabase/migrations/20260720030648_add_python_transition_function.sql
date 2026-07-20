create or replace function public.persist_agent_run_transition(
  p_run_id uuid,
  p_lease_token uuid,
  p_version integer,
  p_run_status text,
  p_provider_state jsonb,
  p_pending_tool_call jsonb,
  p_pending_call_token uuid,
  p_content text,
  p_reasoning text,
  p_reasoning_blocks jsonb,
  p_tool_activity jsonb,
  p_message_status text,
  p_duration_ms integer,
  p_tool_round_count smallint,
  p_python_execution_count smallint,
  p_error text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_message_id uuid;
  changed_rows integer;
begin
  if p_run_status not in ('awaiting_python', 'completed', 'stopped', 'error') then
    raise exception 'Invalid run transition status';
  end if;
  if p_message_status not in ('awaiting_tool', 'completed', 'stopped', 'error') then
    raise exception 'Invalid message transition status';
  end if;

  update public.agent_runs
  set status = p_run_status,
      provider_state = p_provider_state,
      pending_tool_call = p_pending_tool_call,
      pending_call_token = p_pending_call_token,
      lease_token = null,
      lease_expires_at = null,
      tool_round_count = p_tool_round_count,
      python_execution_count = p_python_execution_count,
      error = nullif(p_error, ''),
      completed_at = case when p_run_status in ('completed', 'stopped', 'error') then now() else null end,
      version = p_version + 1
  where id = p_run_id
    and status = 'streaming'
    and version = p_version
    and lease_token = p_lease_token
  returning assistant_message_id into target_message_id;
  if target_message_id is null then return false; end if;

  update public.messages
  set content = p_content,
      reasoning_content = p_reasoning,
      reasoning_blocks = p_reasoning_blocks,
      tool_activity = p_tool_activity,
      status = p_message_status,
      duration_ms = p_duration_ms
  where id = target_message_id and role = 'assistant';
  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then raise exception 'Assistant message transition failed'; end if;
  return true;
end;
$$;

revoke all on function public.persist_agent_run_transition(
  uuid, uuid, integer, text, jsonb, jsonb, uuid, text, text, jsonb, jsonb,
  text, integer, smallint, smallint, text
) from public, anon;
grant execute on function public.persist_agent_run_transition(
  uuid, uuid, integer, text, jsonb, jsonb, uuid, text, text, jsonb, jsonb,
  text, integer, smallint, smallint, text
) to authenticated, service_role;

create or replace function public.stop_agent_run(
  p_assistant_message_id uuid,
  p_content text,
  p_reasoning text,
  p_reasoning_blocks jsonb,
  p_tool_activity jsonb,
  p_duration_ms integer
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  run_status text;
  changed_rows integer;
begin
  select status into run_status
  from public.agent_runs
  where assistant_message_id = p_assistant_message_id
  for update;
  if not found then return 'no_run'; end if;
  if run_status not in ('uploading', 'ready', 'streaming', 'awaiting_python') then
    return 'terminal';
  end if;

  update public.agent_runs
  set status = 'stopped',
      provider_state = '{}'::jsonb,
      pending_tool_call = null,
      pending_call_token = null,
      lease_token = null,
      lease_expires_at = null,
      error = null,
      completed_at = now(),
      version = version + 1
  where assistant_message_id = p_assistant_message_id;

  update public.messages
  set content = p_content,
      reasoning_content = p_reasoning,
      reasoning_blocks = p_reasoning_blocks,
      tool_activity = p_tool_activity,
      duration_ms = p_duration_ms,
      status = 'stopped'
  where id = p_assistant_message_id and role = 'assistant';
  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then raise exception 'Assistant message stop failed'; end if;
  return 'stopped';
end;
$$;

revoke all on function public.stop_agent_run(uuid, text, text, jsonb, jsonb, integer)
from public, anon;
grant execute on function public.stop_agent_run(uuid, text, text, jsonb, jsonb, integer)
to authenticated, service_role;
