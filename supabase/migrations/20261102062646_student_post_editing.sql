-- Owner-only content edits; server-owned identity, workflow, and moderation stay immutable.
create function onecampus_private.edit_own_report(p_id text,p_details jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=onecampus_private.require_user(); r jsonb; d jsonb; phone text; address text; v text;
begin
 select payload into strict r from public.reports where id=p_id and deleted_at is null for update;
 if r->>'ownerUid'<>u::text then raise exception 'Only the reporter may edit this report.' using errcode='42501'; end if;
 if not onecampus_private.keys_exact(p_details,array['title','description','location'],array['contactNumber','contactAddress','visibility','customDetails']) or not onecampus_private.text_ok(p_details,'title',5,120) or not onecampus_private.text_ok(p_details,'description',15,3000) or not onecampus_private.text_ok(p_details,'location',2,120) then raise exception 'Check the report title, description and location.'; end if;
 d:=coalesce(p_details->'customDetails',r->'customDetails','{"topic":"","item":"","color":""}'::jsonb);
 if not onecampus_private.keys_exact(d,array['topic','item','color']) or not onecampus_private.text_ok(d,'topic',0,120) or not onecampus_private.text_ok(d,'item',0,120) or not onecampus_private.text_ok(d,'color',0,120) then raise exception 'Check the custom details.'; end if;
 if (r#>>'{safeDetails,topic}'='Other' and length(btrim(d->>'topic'))<2) or (r#>>'{safeDetails,item}'='Other item' and length(btrim(d->>'item'))<2) or (r#>>'{safeDetails,color}'='Other color' and length(btrim(d->>'color'))<2) then raise exception 'Describe your Other selection manually.'; end if;
 phone:=btrim(coalesce(p_details->>'contactNumber',r->>'contactNumber',''));address:=btrim(coalesce(p_details->>'contactAddress',r->>'contactAddress',''));v:=coalesce(p_details->>'visibility',r->>'visibility','private');
 if (phone<>'' and phone !~ '^\+?[0-9]{10,15}$') or length(address)>160 or v not in ('campus','private') then raise exception 'Check contact details and visibility.'; end if;
 if (p_details ? 'contactNumber' and jsonb_typeof(p_details->'contactNumber')<>'string') or (p_details ? 'contactAddress' and jsonb_typeof(p_details->'contactAddress')<>'string') then raise exception 'Contacts must be text.'; end if;
 r:=r||jsonb_build_object('title',btrim(p_details->>'title'),'description',btrim(p_details->>'description'),'location',btrim(p_details->>'location'),'customDetails',d,'contactNumber',phone,'contactAddress',address,'visibility',case when r->>'type'='grievance' then 'private' when r->>'type' in ('lost','found') then 'campus' else v end,'editedAt',onecampus_private.now_ms(),'reporterName',(select name from public.profiles where id=u));
 update public.reports set payload=r where id=p_id;return r||jsonb_build_object('id',p_id);
end $$;
create function onecampus_private.edit_team(p_id text,p_post jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=onecampus_private.require_user(); r jsonb;
begin
 select payload into strict r from public.team_posts where id=p_id for update;
 if r->>'ownerUid'<>u::text then raise exception 'Only the author may edit this team request.' using errcode='42501'; end if;
 if not onecampus_private.keys_exact(p_post,array['eventId','kind','skills','roles','theme','idea']) or not onecampus_private.text_ok(p_post,'eventId',1,128) or not onecampus_private.text_ok(p_post,'idea',15,1000) or not onecampus_private.enum_ok(p_post,'kind',array['looking','recruiting']) or not onecampus_private.enum_ok(p_post,'theme',array['Campus sustainability','Student productivity','Accessible learning','Community wellbeing','Creative storytelling','Open innovation']) or not onecampus_private.list_ok(p_post->'skills',array['Frontend','Backend','UI/UX design','Research','Presentation','Data analysis','Writing','Photography','Event planning'],1,6) or not onecampus_private.list_ok(p_post->'roles',array['Frontend','Backend','UI/UX design','Research','Presentation','Data analysis','Writing','Photography','Event planning'],case when p_post->>'kind'='recruiting' then 1 else 0 end,6) then raise exception 'Invalid team post.'; end if;

 if p_post->>'eventId'<>r->>'eventId' then raise exception 'A team request cannot move to another event.'; end if;
 if not exists(select 1 from public.events where id=r->>'eventId' and (payload->>'date')::bigint>onecampus_private.now_ms()) then raise exception 'Team editing is closed for this event.'; end if;
 r:=r||p_post||jsonb_build_object('ownerName',(select name from public.profiles where id=u),'editedAt',onecampus_private.now_ms());
 update public.team_posts set payload=r where id=p_id;return r||jsonb_build_object('id',p_id);
end $$;
create function onecampus_private.edit_listing(p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=onecampus_private.require_user(); r public.marketplace_listings;
begin
 select * into strict r from public.marketplace_listings where id=p_id for update;
 if r.seller_id<>u then raise exception 'Only the seller may edit this listing.' using errcode='42501'; end if;
 if r.status<>'available' then raise exception 'Only available listings can be edited. Sold or removed listings stay closed.'; end if;
 if not onecampus_private.keys_exact(p_data,array['title','description','category','price','contact','images'])
 or not onecampus_private.text_ok(p_data,'title',3,100) or not onecampus_private.text_ok(p_data,'description',10,2000)
 or not onecampus_private.enum_ok(p_data,'category',array['Textbooks','Electronics','Stationery','Other'])
 or jsonb_typeof(p_data->'price') is distinct from 'number' or (p_data->>'price')::numeric not between 0 and 100000
 or round((p_data->>'price')::numeric,2)<>(p_data->>'price')::numeric
 or not onecampus_private.text_ok(p_data,'contact',10,16) or p_data->>'contact' !~ '^\+?[0-9]{10,15}$'
 or jsonb_typeof(p_data->'images') is distinct from 'array' then raise exception 'Check the listing fields.'; end if;
 if jsonb_array_length(p_data->'images')>3 or exists(select 1 from jsonb_array_elements(p_data->'images') v where jsonb_typeof(v)<>'string' or length(v#>>'{}')>280000 or (v#>>'{}') !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$') then raise exception 'Use up to 3 compressed JPEG images.'; end if;

 update public.marketplace_listings set title=btrim(p_data->>'title'),description=btrim(p_data->>'description'),category=p_data->>'category',price=(p_data->>'price')::numeric,contact=p_data->>'contact',images=p_data->'images',updated_at=onecampus_private.now_ms() where id=p_id returning * into r;
 return to_jsonb(r);
end $$;
create function public.edit_own_report(p_id text,p_details jsonb) returns jsonb language sql security invoker set search_path='' as $$select onecampus_private.edit_own_report(p_id,p_details)$$;
create function public.edit_team_post(p_id text,p_post jsonb) returns jsonb language sql security invoker set search_path='' as $$select onecampus_private.edit_team(p_id,p_post)$$;
create function public.edit_marketplace_listing(p_id uuid,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select onecampus_private.edit_listing(p_id,p_data)$$;
revoke execute on function onecampus_private.edit_own_report(text,jsonb),onecampus_private.edit_team(text,jsonb),onecampus_private.edit_listing(uuid,jsonb),public.edit_own_report(text,jsonb),public.edit_team_post(text,jsonb),public.edit_marketplace_listing(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function onecampus_private.edit_own_report(text,jsonb),onecampus_private.edit_team(text,jsonb),onecampus_private.edit_listing(uuid,jsonb),public.edit_own_report(text,jsonb),public.edit_team_post(text,jsonb),public.edit_marketplace_listing(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
