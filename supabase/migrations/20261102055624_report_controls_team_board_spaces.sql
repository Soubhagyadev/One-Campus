-- Reporter controls, explicit report sharing, admin statuses, and campus spaces.
alter table public.reports add column deleted_at bigint;
alter table public.reports drop constraint reports_status_check;
alter table public.reports add constraint reports_status_check check(status in ('Submitted','Assigned','In Progress','Resolved','Rejected','Completed'));
drop policy reports_read on public.reports;
create policy reports_read on public.reports for select to authenticated using(deleted_at is null and (owner_uid=(select auth.uid()) or type in ('lost','found') or (type='issue' and payload->>'visibility'='campus') or (select onecampus_private.is_admin())));
-- Existing private issue/grievance payloads are not backfilled into campus visibility.
create or replace function onecampus_private.valid_matches(matches jsonb,owner_id uuid) returns boolean language plpgsql stable set search_path = '' as $$
declare m jsonb;
begin
 if jsonb_typeof(matches) is distinct from 'array' or jsonb_array_length(matches)>3 then return false; end if;
 for m in select value from jsonb_array_elements(matches) loop
  if not onecampus_private.keys_exact(m,array['reportId','confidence','reason']) or not onecampus_private.text_ok(m,'reportId',1,128) or not onecampus_private.text_ok(m,'reason',5,240) or jsonb_typeof(m->'confidence') is distinct from 'number' then return false; end if;
  if (m->>'confidence')::numeric not between 0 and 1 or not exists(select 1 from public.reports where id=m->>'reportId' and type='lost' and status not in ('Resolved','Rejected','Completed') and deleted_at is null and owner_uid<>owner_id) then return false; end if;
 end loop;
 return (select count(distinct v->>'reportId')=jsonb_array_length(matches) from jsonb_array_elements(matches) v);
end $$;
create or replace function onecampus_private.submit_report(p_id text,p_report jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=onecampus_private.require_user(); t bigint:=onecampus_private.now_ms(); r jsonb; hours integer;
begin
 if not onecampus_private.keys_exact(p_report,array['ownerUid','type','category','department','priority','title','description','location','image','photoSafe','safeDetails','status','deadline','aiSummary','aiSource','matchSource','comments','matches','timeline','createdAt','resolvedAt','demo'],array['customDetails','contactNumber','contactAddress','visibility','reporterName']) then raise exception 'Invalid report fields.'; end if;
 if not onecampus_private.text_ok(p_report,'title',5,120) or not onecampus_private.text_ok(p_report,'description',15,3000) or not onecampus_private.text_ok(p_report,'location',2,120) or not onecampus_private.text_ok(p_report,'aiSummary',5,400) or not onecampus_private.text_ok(p_report,'image',0,300000) then raise exception 'Invalid report text or image size.'; end if;
 if not onecampus_private.enum_ok(p_report,'type',array['issue','grievance','lost','found']) or not onecampus_private.enum_ok(p_report,'category',array['Connectivity','Computer hardware','Maintenance','Cleanliness','Library services','Hostel services','Administration','Safety','Personal belongings','Other']) or not onecampus_private.enum_ok(p_report,'department',array['IT','Facilities','Library','Hostel','Administration','Security']) or not onecampus_private.enum_ok(p_report,'priority',array['high','medium','low']) or not onecampus_private.enum_ok(p_report,'aiSource',array['Gemini','Local fallback']) or not onecampus_private.enum_ok(p_report,'matchSource',array['Gemini','Local fallback']) or not onecampus_private.valid_details(p_report->'safeDetails') or p_report#>>'{safeDetails,intent}'<>p_report->>'type' then raise exception 'Invalid report routing.'; end if;
 if jsonb_typeof(p_report->'photoSafe') is distinct from 'boolean' or (p_report->>'image'<>'' and (p_report->>'photoSafe'<>'true' or p_report->>'image' !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+=*$')) then raise exception 'Confirm a safe JPEG attachment.'; end if;
 if p_report->>'ownerUid' is distinct from u::text or p_report->>'status' is distinct from 'Submitted' or p_report->'comments' is distinct from '[]'::jsonb or p_report->'resolvedAt' is distinct from 'null'::jsonb then raise exception 'Reports must start as Submitted and belong to you.' using errcode='42501'; end if;
 if not onecampus_private.valid_matches(p_report->'matches',u) or (p_report->>'type'<>'found' and p_report->'matches'<>'[]'::jsonb) then raise exception 'Invalid lost-item matches.'; end if;
 if p_report ? 'customDetails' and (not onecampus_private.keys_exact(p_report->'customDetails',array['topic','item','color']) or not onecampus_private.text_ok(p_report->'customDetails','topic',0,120) or not onecampus_private.text_ok(p_report->'customDetails','item',0,120) or not onecampus_private.text_ok(p_report->'customDetails','color',0,120)) then raise exception 'Invalid custom details.'; end if;
 if (p_report#>>'{safeDetails,topic}'='Other' and length(btrim(coalesce(p_report#>>'{customDetails,topic}','')))<2) or (p_report#>>'{safeDetails,item}'='Other item' and length(btrim(coalesce(p_report#>>'{customDetails,item}','')))<2) or (p_report#>>'{safeDetails,color}'='Other color' and length(btrim(coalesce(p_report#>>'{customDetails,color}','')))<2) then raise exception 'Describe your Other selection manually.'; end if;
 if p_report ? 'contactNumber' and (not onecampus_private.text_ok(p_report,'contactNumber',0,16) or (p_report->>'contactNumber'<>'' and p_report->>'contactNumber' !~ '^\+?[0-9]{10,15}$')) then raise exception 'Invalid contact number.'; end if;
 if p_report ? 'contactAddress' and not onecampus_private.text_ok(p_report,'contactAddress',0,160) then raise exception 'Invalid contact address.'; end if;
 if p_report ? 'visibility' and not onecampus_private.enum_ok(p_report,'visibility',array['campus','private']) then raise exception 'Invalid report visibility.'; end if;
 hours:=case p_report->>'priority' when 'high' then 24 when 'medium' then 72 else 168 end;
 r:=p_report||jsonb_build_object('ownerUid',u,'createdAt',t,'deadline',t+hours::bigint*3600000,'timeline',jsonb_build_array(jsonb_build_object('status','Submitted','at',t)),'demo',false,'reporterName',(select name from public.profiles where id=u),'visibility',case when p_report->>'type'='grievance' then 'private' when p_report->>'type' in ('lost','found') then 'campus' else coalesce(p_report->>'visibility','private') end);
 insert into public.reports(id,payload) values(p_id,r);
 return r||jsonb_build_object('id',p_id);
end $$;
create or replace function onecampus_private.refresh_report_matches(p_id text,p_matches jsonb,p_source text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=onecampus_private.require_user(); r jsonb;
begin
 select payload into strict r from public.reports where id=p_id and deleted_at is null for update;
 if r->>'ownerUid'<>u::text or r->>'type'<>'found' or r->>'status' in ('Resolved','Rejected','Completed') then raise exception 'Only the finder may refresh this post.' using errcode='42501'; end if;
 if p_source is null or p_source not in ('Gemini','Local fallback') or not onecampus_private.valid_matches(p_matches,u) then raise exception 'Invalid matches.'; end if;
 r:=r||jsonb_build_object('matches',p_matches,'matchSource',p_source); update public.reports set payload=r where id=p_id; return r||jsonb_build_object('id',p_id);
end $$;
create or replace function onecampus_private.update_report(p_id text,p_status text,p_comment text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=onecampus_private.require_user(); r jsonb; t bigint:=onecampus_private.now_ms(); expected text;
begin
 if not onecampus_private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 p_comment:=btrim(coalesce(p_comment,''));
 if length(p_comment)>1000 or (p_status is null and p_comment='') then raise exception 'Choose a status or add a bounded comment.'; end if;
 select payload into strict r from public.reports where id=p_id and deleted_at is null for update;
 if p_status='Rejected' and length(p_comment)<3 then raise exception 'Add a reason when rejecting a report.'; end if;
 if p_status is not null then
  if p_status not in ('Assigned','In Progress','Resolved','Rejected') then raise exception 'Choose a valid admin status.'; end if;
  r:=r||jsonb_build_object('status',p_status,'timeline',(r->'timeline')||jsonb_build_array(jsonb_build_object('status',p_status,'at',t)),'resolvedAt',case when p_status='Resolved' then t else null end);
 end if;
 if p_comment<>'' then
  if jsonb_array_length(r->'comments')>=50 then raise exception 'Comment limit reached.'; end if;
  r:=r||jsonb_build_object('comments',(r->'comments')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'authorUid',u,'text',p_comment,'createdAt',t)));
 end if;
 if p_status in ('Resolved','Rejected') then update public.claims set payload=payload||jsonb_build_object('status','rejected','decidedAt',t) where (found_id=p_id or lost_id=p_id) and status='pending'; end if;
 update public.reports set payload=r where id=p_id; return r||jsonb_build_object('id',p_id);
end $$;
create or replace function onecampus_private.request_claim(p_found_id text,p_lost_id text,p_proof text,p_contact text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=onecampus_private.require_user(); f jsonb; l jsonb; r jsonb; k text:=p_found_id||'__'||p_lost_id;
begin
 if length(btrim(p_proof)) not between 10 and 1000 or p_proof is null or length(btrim(p_contact)) not between 5 and 160 or p_contact is null then raise exception 'Add ownership evidence and a valid contact.'; end if;
 select payload into strict f from public.reports where id=p_found_id and deleted_at is null for update;
 select payload into strict l from public.reports where id=p_lost_id and deleted_at is null;
 if f->>'type'<>'found' or l->>'type'<>'lost' or l->>'ownerUid'<>u::text or f->>'ownerUid'=u::text or f->>'status' in ('Resolved','Rejected','Completed') or l->>'status' in ('Resolved','Rejected','Completed') or f ? 'approvedClaimId' then raise exception 'Choose your own open lost post and another student''s open found post.' using errcode='42501'; end if;
 r:=jsonb_build_object('foundId',p_found_id,'lostId',p_lost_id,'finderUid',f->>'ownerUid','claimantUid',u,'proof',btrim(p_proof),'status','pending','createdAt',onecampus_private.now_ms(),'decidedAt',null);
 insert into public.claims values(k,r); insert into public.claim_contacts values(k,u,btrim(p_contact)); return r||jsonb_build_object('id',k);
end $$;
create or replace function onecampus_private.decide_claim(p_id text,p_approve boolean,p_contact text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=onecampus_private.require_user(); r jsonb; f jsonb; found_key text;
begin
 select found_id into strict found_key from public.claims where id=p_id;
 select payload into strict f from public.reports where id=found_key and deleted_at is null for update;
 select payload into strict r from public.claims where id=p_id for update;
 if r->>'finderUid'<>u::text or r->>'status'<>'pending' then raise exception 'Only the finder may decide a pending claim.' using errcode='42501'; end if;
 if p_approve is null then raise exception 'Choose approve or decline.'; end if;
 if p_approve then
  if f ? 'approvedClaimId' or f->>'status' in ('Resolved','Rejected','Completed') or not exists(select 1 from public.reports where id=r->>'lostId' and deleted_at is null and status not in ('Resolved','Rejected','Completed')) then raise exception 'This item already has an approved claim or is resolved.'; end if;
  if p_contact is null or length(btrim(p_contact)) not between 5 and 160 then raise exception 'Add your contact details to approve.'; end if;
  insert into public.claim_contacts values(p_id,u,btrim(p_contact));
  update public.reports set payload=payload||jsonb_build_object('approvedClaimId',p_id) where id=found_key;
 end if;
 r:=r||jsonb_build_object('status',case when p_approve then 'approved' else 'rejected' end,'decidedAt',onecampus_private.now_ms());update public.claims set payload=r where id=p_id;return r||jsonb_build_object('id',p_id);
end $$;
create or replace function onecampus_private.create_team(p_id text,p_post jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=onecampus_private.require_user(); r jsonb;
begin
 if not onecampus_private.keys_exact(p_post,array['eventId','kind','skills','roles','theme','idea']) or not onecampus_private.text_ok(p_post,'eventId',1,128) or not onecampus_private.text_ok(p_post,'idea',15,1000) or not onecampus_private.enum_ok(p_post,'kind',array['looking','recruiting']) or not onecampus_private.enum_ok(p_post,'theme',array['Campus sustainability','Student productivity','Accessible learning','Community wellbeing','Creative storytelling','Open innovation']) or not onecampus_private.list_ok(p_post->'skills',array['Frontend','Backend','UI/UX design','Research','Presentation','Data analysis','Writing','Photography','Event planning'],1,6) or not onecampus_private.list_ok(p_post->'roles',array['Frontend','Backend','UI/UX design','Research','Presentation','Data analysis','Writing','Photography','Event planning'],case when p_post->>'kind'='recruiting' then 1 else 0 end,6) then raise exception 'Invalid team post.'; end if;
 if not exists(select 1 from public.events where id=p_post->>'eventId' and (payload->>'date')::bigint>onecampus_private.now_ms()) then raise exception 'Team posting is closed for this event.'; end if;
 r:=p_post||jsonb_build_object('ownerUid',u,'ownerName',(select name from public.profiles where id=u),'createdAt',onecampus_private.now_ms(),'demo',false);insert into public.team_posts values(p_id,r);return r||jsonb_build_object('id',p_id);
end $$;
create function onecampus_private.manage_own_report(p_id text,p_action text,p_details jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=onecampus_private.require_user(); r jsonb; t bigint:=onecampus_private.now_ms(); phone text; address text; v text;
begin
 select payload into strict r from public.reports where id=p_id and deleted_at is null for update;
 if r->>'ownerUid'<>u::text then raise exception 'Only the reporter may change this report.' using errcode='42501'; end if;
 if p_action is null or p_action not in ('delete','complete','details') then raise exception 'Unknown reporter action.'; end if;
 if p_action='delete' then update public.reports set deleted_at=t where id=p_id;
 elsif p_action='complete' then
  if r->>'type' not in ('lost','found') or r->>'status' in ('Resolved','Rejected','Completed') then raise exception 'Only an open lost/found report can be completed.'; end if;
  r:=r||jsonb_build_object('status','Completed','resolvedAt',t,'timeline',(r->'timeline')||jsonb_build_array(jsonb_build_object('status','Completed','at',t)));
  update public.reports set payload=r where id=p_id;
 else
  if not onecampus_private.keys_exact(p_details,'{}',array['contactNumber','contactAddress','visibility']) then raise exception 'Invalid contact fields.'; end if;
  phone:=btrim(coalesce(p_details->>'contactNumber','')); address:=btrim(coalesce(p_details->>'contactAddress','')); v:=coalesce(p_details->>'visibility','private');
  if (phone<>'' and phone !~ '^\+?[0-9]{10,15}$') or length(address)>160 or v not in ('campus','private') then raise exception 'Check your contact details and visibility.'; end if;
  if (p_details ? 'contactNumber' and jsonb_typeof(p_details->'contactNumber')<>'string') or (p_details ? 'contactAddress' and jsonb_typeof(p_details->'contactAddress')<>'string') then raise exception 'Contacts must be text.'; end if;
  r:=r||jsonb_build_object('contactNumber',phone,'contactAddress',address,'reporterName',(select name from public.profiles where id=u),'visibility',case when r->>'type'='grievance' then 'private' when r->>'type' in ('lost','found') then 'campus' else v end);
  update public.reports set payload=r where id=p_id;
 end if;
 if p_action in ('delete','complete') then update public.claims set payload=payload||jsonb_build_object('status','rejected','decidedAt',t) where (found_id=p_id or lost_id=p_id) and status='pending'; end if;
 return jsonb_build_object('id',p_id,'action',p_action);
end $$;
create function public.manage_own_report(p_id text,p_action text,p_details jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$select onecampus_private.manage_own_report(p_id,p_action,p_details)$$;
revoke execute on function onecampus_private.manage_own_report(text,text,jsonb),public.manage_own_report(text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function onecampus_private.manage_own_report(text,text,jsonb),public.manage_own_report(text,text,jsonb) to authenticated;

create function onecampus_private.create_space(p_id text,p_space jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=onecampus_private.require_user(); r jsonb;
begin
 if not onecampus_private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if p_id is null or length(p_id) not between 1 and 128 or not onecampus_private.keys_exact(p_space,array['name','type','zone','quiet']) or not onecampus_private.text_ok(p_space,'name',3,120) or not onecampus_private.text_ok(p_space,'zone',3,120) or not onecampus_private.enum_ok(p_space,'type',array['library','lab']) or jsonb_typeof(p_space->'quiet') is distinct from 'boolean' then raise exception 'Check the campus space details.'; end if;
 r:=p_space||jsonb_build_object('level',null,'reportCount',0,'updatedAt',0,'demo',false);
 insert into public.spaces(id,payload) values(p_id,r); return r||jsonb_build_object('id',p_id);
end $$;
create function public.create_campus_space(p_id text,p_space jsonb) returns jsonb language sql security invoker set search_path='' as $$select onecampus_private.create_space(p_id,p_space)$$;
revoke execute on function onecampus_private.create_space(text,jsonb),public.create_campus_space(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function onecampus_private.create_space(text,jsonb),public.create_campus_space(text,jsonb) to authenticated;
notify pgrst,'reload schema';
