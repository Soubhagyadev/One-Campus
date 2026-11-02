-- Admin-only edit_event RPC.
-- Allows updating title, club, date, venue, description, tags.
-- Preserves ownerUid, createdAt, rsvpCount, demo fields.

create function onecampus_private.edit_event(p_id text, p_event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := onecampus_private.require_user();
  existing jsonb;
  updated jsonb;
begin
  if not onecampus_private.is_admin() then
    raise exception 'Only admins can edit events.' using errcode = '42501';
  end if;
  if not onecampus_private.keys_exact(p_event, array['title','club','date','venue','description','tags'])
    or not onecampus_private.text_ok(p_event, 'title', 5, 120)
    or not onecampus_private.text_ok(p_event, 'venue', 3, 120)
    or not onecampus_private.text_ok(p_event, 'description', 20, 2000)
    or not onecampus_private.enum_ok(p_event, 'club', array[
      'Innovation & Entrepreneurship Cell','Coding Club','Literary Society',
      'Photography Club','Environment Club','Cultural Committee'])
    or not onecampus_private.list_ok(p_event->'tags',
      array['Technology','Design','Culture','Sustainability','Workshop','Competition'], 1, 3)
  then
    raise exception 'Invalid event details.';
  end if;
  if jsonb_typeof(p_event->'date') is distinct from 'number'
    or (p_event->>'date')::bigint <= onecampus_private.now_ms()
  then
    raise exception 'Choose a future event date.';
  end if;
  select payload into strict existing from public.events where id = p_id for update;
  -- Merge editable fields over existing, preserving server-owned fields
  updated := existing
    || jsonb_build_object(
        'title',       p_event->'title',
        'club',        p_event->'club',
        'date',        p_event->'date',
        'venue',       p_event->'venue',
        'description', p_event->'description',
        'tags',        p_event->'tags'
       );
  update public.events set payload = updated where id = p_id;
  return updated || jsonb_build_object('id', p_id);
end $$;

create function public.edit_event(p_id text, p_event jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select onecampus_private.edit_event(p_id, p_event)
$$;

revoke execute on function public.edit_event(text, jsonb) from public, anon, authenticated;
grant execute on function onecampus_private.edit_event(text, jsonb) to authenticated;
grant execute on function public.edit_event(text, jsonb) to authenticated;
