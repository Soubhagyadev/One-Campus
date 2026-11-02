-- OneCampus: Supabase Auth, RLS-protected records, and transactional writes.
create schema if not exists onecampus_private;
revoke all on schema onecampus_private from public, anon, authenticated;
grant usage on schema onecampus_private to authenticated;

create function onecampus_private.now_ms() returns bigint language sql stable set search_path = '' as $$ select floor(extract(epoch from statement_timestamp())*1000)::bigint $$;
create function onecampus_private.keys_exact(p jsonb, required text[], optional text[] default '{}') returns boolean language sql immutable set search_path = '' as $$
 select coalesce(jsonb_typeof(p)='object' and p ?& required and not exists(select 1 from jsonb_object_keys(p) k where not(k=any(required||optional))),false)
$$;
create function onecampus_private.text_ok(p jsonb, k text, lo integer, hi integer) returns boolean language sql immutable set search_path = '' as $$
 select coalesce(jsonb_typeof(p->k)='string' and length(btrim(p->>k)) between lo and hi,false)
$$;
create function onecampus_private.enum_ok(p jsonb,k text,choices text[]) returns boolean language sql immutable set search_path = '' as $$ select coalesce(jsonb_typeof(p->k)='string' and p->>k=any(choices),false) $$;
create function onecampus_private.list_ok(p jsonb,choices text[],lo integer,hi integer) returns boolean language plpgsql immutable set search_path = '' as $$
begin
 if jsonb_typeof(p) is distinct from 'array' then return false; end if;
 return jsonb_array_length(p) between lo and hi and not exists(select 1 from jsonb_array_elements(p) v where jsonb_typeof(v)<>'string' or not(v#>>'{}'=any(choices)));
end $$;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null default 'Student' check(length(name) between 1 and 100),
 role text not null default 'student' check(role in ('student','admin'))
);
create function onecampus_private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin')
$$;
create function onecampus_private.require_user() returns uuid language plpgsql stable set search_path = '' as $$
declare u uuid:=auth.uid(); begin if u is null then raise exception 'Sign in to continue.' using errcode='42501'; end if; return u; end $$;
create function onecampus_private.new_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,name,role) values(new.id,coalesce(nullif(left(btrim(coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name','')),100),''),'Student'),'student') on conflict(id) do nothing;
 return new;
end $$;
create trigger onecampus_profile_created after insert on auth.users for each row execute function onecampus_private.new_profile();
insert into public.profiles(id,name) select id,coalesce(nullif(left(btrim(coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name','')),100),''),'Student') from auth.users on conflict(id) do nothing;

create table public.spaces(id text primary key check(length(id) between 1 and 128), payload jsonb not null check(jsonb_typeof(payload)='object'));
create table public.space_votes(space_id text not null references public.spaces(id), voter_id text not null, level text not null check(level in ('free','moderate','crowded')), updated_at bigint not null, primary key(space_id,voter_id));
create index space_votes_active_idx on public.space_votes(space_id,updated_at);
create table public.check_ins(id bigint generated always as identity primary key, space_id text not null references public.spaces(id),level text not null check(level in ('free','moderate','crowded')),weekday integer not null check(weekday between 0 and 6),hour integer not null check(hour between 0 and 23),created_at bigint not null,seed_key text unique);
create index check_ins_time_idx on public.check_ins(created_at);

create table public.reports (
 id text primary key check(length(id) between 1 and 128), payload jsonb not null,
 owner_uid uuid generated always as ((payload->>'ownerUid')::uuid) stored references auth.users(id),
 type text generated always as (payload->>'type') stored,
 status text generated always as (payload->>'status') stored,
 created_at bigint generated always as ((payload->>'createdAt')::bigint) stored,
 check(owner_uid is not null),check(type in ('issue','grievance','lost','found')),check(status in ('Submitted','Assigned','In Progress','Resolved'))
);
create index reports_owner_idx on public.reports(owner_uid);
create index reports_type_created_idx on public.reports(type,created_at desc);
create index reports_status_idx on public.reports(status);
create table public.claims (
 id text primary key check(length(id) between 1 and 260),payload jsonb not null,
 found_id text generated always as (payload->>'foundId') stored not null references public.reports(id),
 lost_id text generated always as (payload->>'lostId') stored not null references public.reports(id),
 finder_uid uuid generated always as ((payload->>'finderUid')::uuid) stored not null references auth.users(id),
 claimant_uid uuid generated always as ((payload->>'claimantUid')::uuid) stored not null references auth.users(id),
 status text generated always as (payload->>'status') stored not null check(status in ('pending','approved','rejected'))
);
create unique index claims_one_approved_found on public.claims(found_id) where status='approved';
create index claims_finder_idx on public.claims(finder_uid);
create index claims_claimant_idx on public.claims(claimant_uid);
create index claims_lost_idx on public.claims(lost_id);
create table public.claim_contacts(claim_id text not null references public.claims(id),user_id uuid not null references auth.users(id),contact text not null check(length(btrim(contact)) between 5 and 160),primary key(claim_id,user_id));
create index claim_contacts_user_idx on public.claim_contacts(user_id);
create table public.club_leads(user_id uuid primary key references auth.users(id),club text not null check(club in ('Innovation & Entrepreneurship Cell','Coding Club','Literary Society','Photography Club','Environment Club','Cultural Committee')));
create table public.events(id text primary key check(length(id) between 1 and 128),payload jsonb not null,owner_uid uuid generated always as ((payload->>'ownerUid')::uuid) stored not null references auth.users(id));
create index events_owner_idx on public.events(owner_uid);
create table public.event_rsvps(event_id text not null references public.events(id),user_id uuid not null references auth.users(id),active boolean not null,primary key(event_id,user_id));
create index event_rsvps_user_idx on public.event_rsvps(user_id);
create table public.team_posts(id text primary key check(length(id) between 1 and 128),payload jsonb not null,event_id text generated always as (payload->>'eventId') stored not null references public.events(id),owner_uid uuid generated always as ((payload->>'ownerUid')::uuid) stored not null references auth.users(id));
create index team_posts_event_idx on public.team_posts(event_id);
create index team_posts_owner_idx on public.team_posts(owner_uid);
-- There is intentionally no wellness-entry table, UID, note, tag, or personal timestamp.
create table public.wellness_daily(day date primary key,m1 integer not null default 0 check(m1>=0),m2 integer not null default 0 check(m2>=0),m3 integer not null default 0 check(m3>=0),m4 integer not null default 0 check(m4>=0),m5 integer not null default 0 check(m5>=0),total integer not null check(total=m1+m2+m3+m4+m5 and total>0));

-- Explicit read policies; authenticated clients have no direct table-write grants.
alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(id=(select auth.uid()) or (select onecampus_private.is_admin()));
create policy profiles_name_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
alter table public.spaces enable row level security;
create policy spaces_read on public.spaces for select to authenticated using((select auth.uid()) is not null);
alter table public.space_votes enable row level security;
create policy votes_read on public.space_votes for select to authenticated using(voter_id=(select auth.uid())::text or (select onecampus_private.is_admin()));
alter table public.check_ins enable row level security;
create policy check_ins_read on public.check_ins for select to authenticated using((select auth.uid()) is not null);
alter table public.reports enable row level security;
create policy reports_read on public.reports for select to authenticated using(owner_uid=(select auth.uid()) or type in ('lost','found') or (select onecampus_private.is_admin()));
alter table public.claims enable row level security;
create policy claims_read on public.claims for select to authenticated using(finder_uid=(select auth.uid()) or claimant_uid=(select auth.uid()));
alter table public.claim_contacts enable row level security;
create policy contacts_read on public.claim_contacts for select to authenticated using(user_id=(select auth.uid()) or exists(select 1 from public.claims c where c.id=claim_id and c.status='approved' and (c.finder_uid=(select auth.uid()) or c.claimant_uid=(select auth.uid()))));
alter table public.club_leads enable row level security;
create policy leads_read on public.club_leads for select to authenticated using(user_id=(select auth.uid()) or (select onecampus_private.is_admin()));
alter table public.events enable row level security;
create policy events_read on public.events for select to authenticated using((select auth.uid()) is not null);
alter table public.event_rsvps enable row level security;
create policy rsvps_read on public.event_rsvps for select to authenticated using(user_id=(select auth.uid()) or (select onecampus_private.is_admin()));
alter table public.team_posts enable row level security;
create policy team_posts_read on public.team_posts for select to authenticated using((select auth.uid()) is not null);
alter table public.wellness_daily enable row level security;
create policy wellness_cohort_read on public.wellness_daily for select to authenticated using(total>=10 and (select onecampus_private.is_admin()));
revoke all on public.profiles,public.spaces,public.space_votes,public.check_ins,public.reports,public.claims,public.claim_contacts,public.club_leads,public.events,public.event_rsvps,public.team_posts,public.wellness_daily from public,anon,authenticated;
grant select on public.profiles,public.spaces,public.space_votes,public.check_ins,public.reports,public.claims,public.claim_contacts,public.club_leads,public.events,public.event_rsvps,public.team_posts,public.wellness_daily to authenticated;
grant update(name) on public.profiles to authenticated;

create function onecampus_private.my_profile() returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=onecampus_private.require_user(); r public.profiles;
begin
 insert into public.profiles(id,name) values(u,'Student') on conflict(id) do nothing;
 select * into strict r from public.profiles where id=u;
 return jsonb_build_object('uid',r.id,'name',r.name,'role',r.role);
end $$;
create function onecampus_private.cast_vote(p_space_id text,p_level text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=onecampus_private.require_user(); t bigint:=onecampus_private.now_ms(); s jsonb; n integer; mean numeric; current_level text; campus timestamp:=statement_timestamp() at time zone 'Asia/Kolkata';
begin
 if p_level is null or p_level not in ('free','moderate','crowded') then raise exception 'Invalid crowd level.'; end if;
 select payload into strict s from public.spaces where id=p_space_id for update;
 insert into public.space_votes values(p_space_id,u::text,p_level,t) on conflict(space_id,voter_id) do update set level=excluded.level,updated_at=excluded.updated_at;
 insert into public.check_ins(space_id,level,weekday,hour,created_at) values(p_space_id,p_level,extract(dow from campus)::integer,extract(hour from campus)::integer,t);
 select count(*),avg(case level when 'free' then 0 when 'moderate' then 1 else 2 end) into n,mean from public.space_votes where space_id=p_space_id and updated_at>t-1200000;
 current_level:=case when mean<0.5 then 'free' when mean<1.5 then 'moderate' else 'crowded' end;
 s:=s||jsonb_build_object('level',current_level,'reportCount',n,'updatedAt',t);
 update public.spaces set payload=s where id=p_space_id;
 return s||jsonb_build_object('id',p_space_id);
end $$;

create function onecampus_private.valid_details(d jsonb) returns boolean language sql immutable set search_path = '' as $$
 select onecampus_private.keys_exact(d,array['intent','topic','item','color','feature','urgency'])
 and onecampus_private.enum_ok(d,'intent',array['issue','grievance','lost','found'])
 and onecampus_private.enum_ok(d,'topic',array['Wi-Fi unavailable','Computer not working','Broken furniture','Water leak','Cleaning needed','Library service','Hostel service','Administrative service','Safety concern','Personal belonging','Other'])
 and onecampus_private.enum_ok(d,'item',array['Not applicable','Bottle','Backpack','Laptop','Phone','Headphones','Keys','Book','Wallet','Other item'])
 and onecampus_private.enum_ok(d,'color',array['Not specified','Black','Blue','Red','Green','White','Silver','Brown','Other color'])
 and onecampus_private.enum_ok(d,'feature',array['Not specified','Metal','Plastic','Fabric','Leather','Patterned','Plain','With a strap','With a case'])
 and onecampus_private.enum_ok(d,'urgency',array['high','medium','low'])
$$;
create function onecampus_private.valid_matches(matches jsonb,owner_id uuid) returns boolean language plpgsql stable set search_path = '' as $$
declare m jsonb;
begin
 if jsonb_typeof(matches) is distinct from 'array' or jsonb_array_length(matches)>3 then return false; end if;
 for m in select value from jsonb_array_elements(matches) loop
  if not onecampus_private.keys_exact(m,array['reportId','confidence','reason']) or not onecampus_private.text_ok(m,'reportId',1,128) or not onecampus_private.text_ok(m,'reason',5,240) or jsonb_typeof(m->'confidence') is distinct from 'number' then return false; end if;
  if (m->>'confidence')::numeric not between 0 and 1 or not exists(select 1 from public.reports where id=m->>'reportId' and type='lost' and status<>'Resolved' and owner_uid<>owner_id) then return false; end if;
 end loop;
 return (select count(distinct v->>'reportId')=jsonb_array_length(matches) from jsonb_array_elements(matches) v);
end $$;
create function onecampus_private.submit_report(p_id text,p_report jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=onecampus_private.require_user(); t bigint:=onecampus_private.now_ms(); r jsonb; hours integer;
begin
 if not onecampus_private.keys_exact(p_report,array['ownerUid','type','category','department','priority','title','description','location','image','photoSafe','safeDetails','status','deadline','aiSummary','aiSource','matchSource','comments','matches','timeline','createdAt','resolvedAt','demo']) then raise exception 'Invalid report fields.'; end if;
 if not onecampus_private.text_ok(p_report,'title',5,120) or not onecampus_private.text_ok(p_report,'description',15,3000) or not onecampus_private.text_ok(p_report,'location',2,120) or not onecampus_private.text_ok(p_report,'aiSummary',5,400) or not onecampus_private.text_ok(p_report,'image',0,300000) then raise exception 'Invalid report text or image size.'; end if;
 if not onecampus_private.enum_ok(p_report,'type',array['issue','grievance','lost','found']) or not onecampus_private.enum_ok(p_report,'category',array['Connectivity','Computer hardware','Maintenance','Cleanliness','Library services','Hostel services','Administration','Safety','Personal belongings','Other']) or not onecampus_private.enum_ok(p_report,'department',array['IT','Facilities','Library','Hostel','Administration','Security']) or not onecampus_private.enum_ok(p_report,'priority',array['high','medium','low']) or not onecampus_private.enum_ok(p_report,'aiSource',array['Gemini','Local fallback']) or not onecampus_private.enum_ok(p_report,'matchSource',array['Gemini','Local fallback']) or not onecampus_private.valid_details(p_report->'safeDetails') or p_report#>>'{safeDetails,intent}'<>p_report->>'type' then raise exception 'Invalid report routing.'; end if;
 if jsonb_typeof(p_report->'photoSafe') is distinct from 'boolean' or (p_report->>'image'<>'' and (p_report->>'photoSafe'<>'true' or p_report->>'image' !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+=*$')) then raise exception 'Confirm a safe JPEG attachment.'; end if;
 if p_report->>'ownerUid' is distinct from u::text or p_report->>'status' is distinct from 'Submitted' or p_report->'comments' is distinct from '[]'::jsonb or p_report->'resolvedAt' is distinct from 'null'::jsonb then raise exception 'Reports must start as Submitted and belong to you.' using errcode='42501'; end if;
 if not onecampus_private.valid_matches(p_report->'matches',u) or (p_report->>'type'<>'found' and p_report->'matches'<>'[]'::jsonb) then raise exception 'Invalid lost-item matches.'; end if;
 hours:=case p_report->>'priority' when 'high' then 24 when 'medium' then 72 else 168 end;
 r:=p_report||jsonb_build_object('ownerUid',u,'createdAt',t,'deadline',t+hours::bigint*3600000,'timeline',jsonb_build_array(jsonb_build_object('status','Submitted','at',t)),'demo',false);
 insert into public.reports(id,payload) values(p_id,r);
 return r||jsonb_build_object('id',p_id);
end $$;
create function onecampus_private.refresh_report_matches(p_id text,p_matches jsonb,p_source text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=onecampus_private.require_user(); r jsonb;
begin
 select payload into strict r from public.reports where id=p_id for update;
 if r->>'ownerUid'<>u::text or r->>'type'<>'found' or r->>'status'='Resolved' then raise exception 'Only the finder may refresh this post.' using errcode='42501'; end if;
 if p_source is null or p_source not in ('Gemini','Local fallback') or not onecampus_private.valid_matches(p_matches,u) then raise exception 'Invalid matches.'; end if;
 r:=r||jsonb_build_object('matches',p_matches,'matchSource',p_source); update public.reports set payload=r where id=p_id; return r||jsonb_build_object('id',p_id);
end $$;
create function onecampus_private.update_report(p_id text,p_status text,p_comment text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=onecampus_private.require_user(); r jsonb; t bigint:=onecampus_private.now_ms(); expected text;
begin
 if not onecampus_private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 p_comment:=btrim(coalesce(p_comment,''));
 if length(p_comment)>1000 or (p_status is null and p_comment='') then raise exception 'Choose a status or add a bounded comment.'; end if;
 select payload into strict r from public.reports where id=p_id for update;
 expected:=case r->>'status' when 'Submitted' then 'Assigned' when 'Assigned' then 'In Progress' when 'In Progress' then 'Resolved' end;
 if p_status is not null then
  if p_status is distinct from expected then raise exception 'Choose the next status in the timeline.'; end if;
  r:=r||jsonb_build_object('status',p_status,'timeline',(r->'timeline')||jsonb_build_array(jsonb_build_object('status',p_status,'at',t)),'resolvedAt',case when p_status='Resolved' then t else null end);
 end if;
 if p_comment<>'' then
  if jsonb_array_length(r->'comments')>=50 then raise exception 'Comment limit reached.'; end if;
  r:=r||jsonb_build_object('comments',(r->'comments')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'authorUid',u,'text',p_comment,'createdAt',t)));
 end if;
 update public.reports set payload=r where id=p_id; return r||jsonb_build_object('id',p_id);
end $$;
create function onecampus_private.request_claim(p_found_id text,p_lost_id text,p_proof text,p_contact text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=onecampus_private.require_user(); f jsonb; l jsonb; r jsonb; k text:=p_found_id||'__'||p_lost_id;
begin
 if length(btrim(p_proof)) not between 10 and 1000 or p_proof is null or length(btrim(p_contact)) not between 5 and 160 or p_contact is null then raise exception 'Add ownership evidence and a valid contact.'; end if;
 select payload into strict f from public.reports where id=p_found_id for update;
 select payload into strict l from public.reports where id=p_lost_id;
 if f->>'type'<>'found' or l->>'type'<>'lost' or l->>'ownerUid'<>u::text or f->>'ownerUid'=u::text or f->>'status'='Resolved' or l->>'status'='Resolved' or f ? 'approvedClaimId' then raise exception 'Choose your own open lost post and another student''s open found post.' using errcode='42501'; end if;
 r:=jsonb_build_object('foundId',p_found_id,'lostId',p_lost_id,'finderUid',f->>'ownerUid','claimantUid',u,'proof',btrim(p_proof),'status','pending','createdAt',onecampus_private.now_ms(),'decidedAt',null);
 insert into public.claims values(k,r); insert into public.claim_contacts values(k,u,btrim(p_contact)); return r||jsonb_build_object('id',k);
end $$;
create function onecampus_private.decide_claim(p_id text,p_approve boolean,p_contact text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=onecampus_private.require_user(); r jsonb; f jsonb; found_key text;
begin
 select found_id into strict found_key from public.claims where id=p_id;
 select payload into strict f from public.reports where id=found_key for update;
 select payload into strict r from public.claims where id=p_id for update;
 if r->>'finderUid'<>u::text or r->>'status'<>'pending' then raise exception 'Only the finder may decide a pending claim.' using errcode='42501'; end if;
 if p_approve is null then raise exception 'Choose approve or decline.'; end if;
 if p_approve then
  if f ? 'approvedClaimId' or f->>'status'='Resolved' then raise exception 'This item already has an approved claim or is resolved.'; end if;
  if p_contact is null or length(btrim(p_contact)) not between 5 and 160 then raise exception 'Add your contact details to approve.'; end if;
  insert into public.claim_contacts values(p_id,u,btrim(p_contact));
  update public.reports set payload=payload||jsonb_build_object('approvedClaimId',p_id) where id=found_key;
 end if;
 r:=r||jsonb_build_object('status',case when p_approve then 'approved' else 'rejected' end,'decidedAt',onecampus_private.now_ms());update public.claims set payload=r where id=p_id;return r||jsonb_build_object('id',p_id);
end $$;

create function onecampus_private.create_event(p_id text,p_event jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=onecampus_private.require_user(); r jsonb;
begin
 if not onecampus_private.keys_exact(p_event,array['title','club','date','venue','description','tags']) or not onecampus_private.text_ok(p_event,'title',5,120) or not onecampus_private.text_ok(p_event,'venue',3,120) or not onecampus_private.text_ok(p_event,'description',20,2000) or not onecampus_private.enum_ok(p_event,'club',array['Innovation & Entrepreneurship Cell','Coding Club','Literary Society','Photography Club','Environment Club','Cultural Committee']) or not onecampus_private.list_ok(p_event->'tags',array['Technology','Design','Culture','Sustainability','Workshop','Competition'],1,3) then raise exception 'Invalid event details.'; end if;
 if jsonb_typeof(p_event->'date') is distinct from 'number' or (p_event->>'date')::bigint<=onecampus_private.now_ms() then raise exception 'Choose a future event date.'; end if;
 if not onecampus_private.is_admin() and not exists(select 1 from public.club_leads where user_id=u and club=p_event->>'club') then raise exception 'Only the assigned club lead or an admin can create this event.' using errcode='42501'; end if;
 r:=p_event||jsonb_build_object('ownerUid',u,'createdAt',onecampus_private.now_ms(),'rsvpCount',0,'demo',false);insert into public.events values(p_id,r);return r||jsonb_build_object('id',p_id);
end $$;
create function onecampus_private.set_rsvp(p_event_id text,p_active boolean) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=onecampus_private.require_user(); r jsonb; before boolean;
begin
 if p_active is null then raise exception 'Choose an RSVP state.'; end if;
 select payload into strict r from public.events where id=p_event_id for update;
 if (r->>'date')::bigint<=onecampus_private.now_ms() then raise exception 'RSVP is closed.'; end if;
 select active into before from public.event_rsvps where event_id=p_event_id and user_id=u;before:=coalesce(before,false);
 if before<>p_active then
  insert into public.event_rsvps values(p_event_id,u,p_active) on conflict(event_id,user_id) do update set active=excluded.active;
  r:=r||jsonb_build_object('rsvpCount',(r->>'rsvpCount')::integer+case when p_active then 1 else -1 end);update public.events set payload=r where id=p_event_id;
 end if;
 return jsonb_build_object('active',p_active);
end $$;
create function onecampus_private.create_team(p_id text,p_post jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=onecampus_private.require_user(); r jsonb;
begin
 if not onecampus_private.keys_exact(p_post,array['eventId','kind','skills','roles','theme','idea']) or not onecampus_private.text_ok(p_post,'eventId',1,128) or not onecampus_private.text_ok(p_post,'idea',15,1000) or not onecampus_private.enum_ok(p_post,'kind',array['looking','recruiting']) or not onecampus_private.enum_ok(p_post,'theme',array['Campus sustainability','Student productivity','Accessible learning','Community wellbeing','Creative storytelling','Open innovation']) or not onecampus_private.list_ok(p_post->'skills',array['Frontend','Backend','UI/UX design','Research','Presentation','Data analysis','Writing','Photography','Event planning'],1,6) or not onecampus_private.list_ok(p_post->'roles',array['Frontend','Backend','UI/UX design','Research','Presentation','Data analysis','Writing','Photography','Event planning'],case when p_post->>'kind'='recruiting' then 1 else 0 end,6) then raise exception 'Invalid team post.'; end if;
 if not exists(select 1 from public.events where id=p_post->>'eventId' and (payload->>'date')::bigint>onecampus_private.now_ms()) then raise exception 'Team posting is closed for this event.'; end if;
 r:=p_post||jsonb_build_object('ownerUid',u,'createdAt',onecampus_private.now_ms(),'demo',false);insert into public.team_posts values(p_id,r);return r||jsonb_build_object('id',p_id);
end $$;
create function onecampus_private.record_wellness(p_mood integer,p_day text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=onecampus_private.require_user(); d date:=(statement_timestamp() at time zone 'Asia/Kolkata')::date;
begin
 if p_mood is null or p_mood not between 1 and 5 or p_day is distinct from d::text then raise exception 'Choose a mood for today in campus time.'; end if;
 insert into public.wellness_daily(day,m1,m2,m3,m4,m5,total) values(d,(p_mood=1)::integer,(p_mood=2)::integer,(p_mood=3)::integer,(p_mood=4)::integer,(p_mood=5)::integer,1)
 on conflict(day) do update set m1=wellness_daily.m1+excluded.m1,m2=wellness_daily.m2+excluded.m2,m3=wellness_daily.m3+excluded.m3,m4=wellness_daily.m4+excluded.m4,m5=wellness_daily.m5+excluded.m5,total=wellness_daily.total+1;
 return jsonb_build_object('shared',true);
end $$;

create function onecampus_private.load_demo(p_spaces jsonb,p_logs jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=onecampus_private.require_user(); s jsonb; l jsonb; i integer; key text; t bigint:=onecampus_private.now_ms(); n integer:=0;
begin
 if not onecampus_private.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if jsonb_typeof(p_spaces) is distinct from 'array' or jsonb_typeof(p_logs) is distinct from 'array' or jsonb_array_length(p_spaces)>20 or jsonb_array_length(p_logs)>3000 then raise exception 'Invalid demo dataset.'; end if;
 for s in select value from jsonb_array_elements(p_spaces) loop
  if not onecampus_private.keys_exact(s,array['id','name','type','zone','quiet','level','reportCount','updatedAt','demo'],array['bestHour']) or not onecampus_private.text_ok(s,'id',1,128) or not onecampus_private.text_ok(s,'name',1,120) or not onecampus_private.text_ok(s,'zone',1,120) or not onecampus_private.enum_ok(s,'type',array['library','lab']) or not onecampus_private.enum_ok(s,'level',array['free','moderate','crowded']) or jsonb_typeof(s->'quiet') is distinct from 'boolean' or jsonb_typeof(s->'reportCount') is distinct from 'number' or (s->>'reportCount')::integer not between 0 and 100 then raise exception 'Invalid demo space.'; end if;
  insert into public.spaces values(s->>'id',(s-'id')||jsonb_build_object('updatedAt',t,'demo',true)) on conflict(id) do update set payload=excluded.payload;
  delete from public.space_votes where space_id=s->>'id';
  for i in 1..(s->>'reportCount')::integer loop insert into public.space_votes values(s->>'id','synthetic-'||i,s->>'level',t); end loop;
 end loop;
 for l in select value from jsonb_array_elements(p_logs) loop
  if not onecampus_private.keys_exact(l,array['spaceId','level','weekday','hour','createdAt']) or not onecampus_private.text_ok(l,'spaceId',1,128) or not onecampus_private.enum_ok(l,'level',array['free','moderate','crowded']) or (l->>'weekday')::integer not between 0 and 6 or (l->>'hour')::integer not between 0 and 23 or (l->>'createdAt')::bigint>t then raise exception 'Invalid anonymous demo log.'; end if;
  key:='demo-'||(l->>'spaceId')||'-'||(l->>'createdAt');insert into public.check_ins(space_id,level,weekday,hour,created_at,seed_key) values(l->>'spaceId',l->>'level',(l->>'weekday')::integer,(l->>'hour')::integer,(l->>'createdAt')::bigint,key) on conflict(seed_key) do nothing;n:=n+1;
 end loop;
 return jsonb_build_object('spaces',jsonb_array_length(p_spaces),'logs',n);
end $$;

-- Exposed RPCs are SECURITY INVOKER wrappers. The non-exposed implementation functions
-- deliberately elevate only after checking auth.uid()/database roles and validating inputs.
create function public.get_my_profile() returns jsonb language sql security invoker set search_path = '' as $$select onecampus_private.my_profile()$$;
create function public.cast_crowd_vote(p_space_id text,p_level text) returns jsonb language sql security invoker set search_path = '' as $$select onecampus_private.cast_vote(p_space_id,p_level)$$;
create function public.submit_report(p_id text,p_report jsonb) returns jsonb language sql security invoker set search_path = '' as $$select onecampus_private.submit_report(p_id,p_report)$$;
create function public.refresh_report_matches(p_id text,p_matches jsonb,p_source text) returns jsonb language sql security invoker set search_path = '' as $$select onecampus_private.refresh_report_matches(p_id,p_matches,p_source)$$;
create function public.update_report(p_id text,p_status text,p_comment text) returns jsonb language sql security invoker set search_path = '' as $$select onecampus_private.update_report(p_id,p_status,p_comment)$$;
create function public.request_claim(p_found_id text,p_lost_id text,p_proof text,p_contact text) returns jsonb language sql security invoker set search_path = '' as $$select onecampus_private.request_claim(p_found_id,p_lost_id,p_proof,p_contact)$$;
create function public.decide_claim(p_id text,p_approve boolean,p_contact text) returns jsonb language sql security invoker set search_path = '' as $$select onecampus_private.decide_claim(p_id,p_approve,p_contact)$$;
create function public.create_event(p_id text,p_event jsonb) returns jsonb language sql security invoker set search_path = '' as $$select onecampus_private.create_event(p_id,p_event)$$;
create function public.set_event_rsvp(p_event_id text,p_active boolean) returns jsonb language sql security invoker set search_path = '' as $$select onecampus_private.set_rsvp(p_event_id,p_active)$$;
create function public.create_team_post(p_id text,p_post jsonb) returns jsonb language sql security invoker set search_path = '' as $$select onecampus_private.create_team(p_id,p_post)$$;
create function public.record_wellness(p_mood integer,p_day text) returns jsonb language sql security invoker set search_path = '' as $$select onecampus_private.record_wellness(p_mood,p_day)$$;
create function public.load_campus_demo(p_spaces jsonb,p_logs jsonb) returns jsonb language sql security invoker set search_path = '' as $$select onecampus_private.load_demo(p_spaces,p_logs)$$;
revoke execute on all functions in schema onecampus_private from public,anon,authenticated,service_role;
grant execute on function onecampus_private.is_admin(),onecampus_private.my_profile(),onecampus_private.cast_vote(text,text),onecampus_private.submit_report(text,jsonb),onecampus_private.refresh_report_matches(text,jsonb,text),onecampus_private.update_report(text,text,text),onecampus_private.request_claim(text,text,text,text),onecampus_private.decide_claim(text,boolean,text),onecampus_private.create_event(text,jsonb),onecampus_private.set_rsvp(text,boolean),onecampus_private.create_team(text,jsonb),onecampus_private.record_wellness(integer,text),onecampus_private.load_demo(jsonb,jsonb) to authenticated;
revoke execute on function public.get_my_profile(),public.cast_crowd_vote(text,text),public.submit_report(text,jsonb),public.refresh_report_matches(text,jsonb,text),public.update_report(text,text,text),public.request_claim(text,text,text,text),public.decide_claim(text,boolean,text),public.create_event(text,jsonb),public.set_event_rsvp(text,boolean),public.create_team_post(text,jsonb),public.record_wellness(integer,text),public.load_campus_demo(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.get_my_profile(),public.cast_crowd_vote(text,text),public.submit_report(text,jsonb),public.refresh_report_matches(text,jsonb,text),public.update_report(text,text,text),public.request_claim(text,text,text,text),public.decide_claim(text,boolean,text),public.create_event(text,jsonb),public.set_event_rsvp(text,boolean),public.create_team_post(text,jsonb),public.record_wellness(integer,text),public.load_campus_demo(jsonb,jsonb) to authenticated;

insert into public.spaces(id,payload) values
 ('reading-hall','{"name":"Library Ground Floor Reading Hall","type":"library","zone":"Central Library · Ground floor","quiet":true,"level":null,"reportCount":0,"updatedAt":0,"demo":true}'),
 ('quiet-zone','{"name":"Library 2nd Floor Quiet Zone","type":"library","zone":"Central Library · Second floor","quiet":true,"level":null,"reportCount":0,"updatedAt":0,"demo":true}'),
 ('discussion-a','{"name":"Discussion Room A","type":"library","zone":"Central Library · First floor","quiet":false,"level":null,"reportCount":0,"updatedAt":0,"demo":true}'),
 ('lab-1','{"name":"Computer Lab 1","type":"lab","zone":"Learning Centre · Block A","quiet":true,"level":null,"reportCount":0,"updatedAt":0,"demo":true}'),
 ('lab-2','{"name":"Computer Lab 2","type":"lab","zone":"Learning Centre · Block B","quiet":true,"level":null,"reportCount":0,"updatedAt":0,"demo":true}'),
 ('lab-3','{"name":"Computer Lab 3","type":"lab","zone":"Learning Centre · Block B","quiet":false,"level":null,"reportCount":0,"updatedAt":0,"demo":true}');

-- RLS protects delivery of all row changes. No raw individual wellness records exist.
do $$ declare name text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach name in array array['spaces','reports','claims','events','event_rsvps','team_posts','wellness_daily'] loop
   execute format('alter publication supabase_realtime add table public.%I',name);
  end loop;
 end if;
end $$;

notify pgrst, 'reload schema';
