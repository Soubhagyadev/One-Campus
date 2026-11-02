-- Campus commerce: immediate listings, post-publication moderation, simulated food payments.
create table public.marketplace_listings (
 id uuid primary key, seller_id uuid not null references auth.users(id), seller_name text not null,
 title text not null check(length(title) between 3 and 100), description text not null check(length(description) between 10 and 2000),
 category text not null check(category in ('Textbooks','Electronics','Stationery','Other')),
 price numeric(10,2) not null check(price between 0 and 100000), contact text not null check(contact ~ '^\+?[0-9]{10,15}$'),
 images jsonb not null default '[]' check(jsonb_typeof(images)='array' and jsonb_array_length(images)<=3),
 status text not null default 'available' check(status in ('available','sold','removed')),
 removal_reason text not null default '', created_at bigint not null, updated_at bigint not null
);
create index marketplace_seller_idx on public.marketplace_listings(seller_id,created_at desc);
create index marketplace_status_time_idx on public.marketplace_listings(status,created_at desc);
alter table public.marketplace_listings enable row level security;
revoke all on public.marketplace_listings from public,anon,authenticated,service_role;
grant select on public.marketplace_listings to authenticated;
create policy marketplace_read on public.marketplace_listings for select to authenticated using(status='available' or seller_id=(select auth.uid()) or (select onecampus_private.is_admin()));

create table public.meal_services (
 category text primary key check(category in ('Breakfast','Lunch','Snacks','Dinner')),
 price integer not null, start_minute integer not null check(start_minute between 0 and 1439), end_minute integer not null check(end_minute between 0 and 1439),
 enabled boolean not null default true, check(start_minute<>end_minute),
 check(price=case when category in ('Breakfast','Snacks') then 60 else 100 end)
);
create table public.food_items (
 id uuid primary key, category text not null references public.meal_services(category),
 name text not null check(length(name) between 2 and 100), description text not null check(length(description) between 3 and 500), available boolean not null default true
);
create index food_items_category_idx on public.food_items(category);
create table public.food_orders (
 id uuid primary key, user_id uuid not null references auth.users(id), student_name text not null, student_email text not null,
 category text not null references public.meal_services(category), items jsonb not null, amount integer not null check(amount in (60,100)),
 payment_status text not null default 'pending' check(payment_status in ('pending','mock_paid','cancelled')),
 transaction_id text unique, created_at bigint not null, paid_at bigint, collected_at bigint,
 check((payment_status='mock_paid' and transaction_id is not null and paid_at is not null) or (payment_status<>'mock_paid' and transaction_id is null and paid_at is null)),
 check(collected_at is null or payment_status='mock_paid')
);
create index food_orders_user_time_idx on public.food_orders(user_id,created_at desc);
create index food_orders_category_idx on public.food_orders(category);
create index food_orders_time_idx on public.food_orders(created_at desc);

create function onecampus_private.meal_open(s public.meal_services) returns boolean language sql stable set search_path='' as $$
 select s.enabled and case when s.start_minute<s.end_minute then m>=s.start_minute and m<s.end_minute else m>=s.start_minute or m<s.end_minute end
 from (select extract(hour from statement_timestamp() at time zone 'Asia/Kolkata')::integer*60+extract(minute from statement_timestamp() at time zone 'Asia/Kolkata')::integer m) x
$$;
alter table public.meal_services enable row level security;
alter table public.food_items enable row level security;
alter table public.food_orders enable row level security;
revoke all on public.meal_services,public.food_items,public.food_orders from public,anon,authenticated,service_role;
grant select on public.meal_services,public.food_items,public.food_orders to authenticated;
create policy meal_schedule_read on public.meal_services for select to authenticated using(true);
create policy food_menu_read on public.food_items for select to authenticated using((select onecampus_private.is_admin()) or (available and exists(select 1 from public.meal_services s where s.category=food_items.category and onecampus_private.meal_open(s))));
create policy food_order_read on public.food_orders for select to authenticated using(user_id=(select auth.uid()) or (select onecampus_private.is_admin()));

create function onecampus_private.post_listing(p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=onecampus_private.require_user(); r public.marketplace_listings; n text; t bigint:=onecampus_private.now_ms();
begin
 if not onecampus_private.keys_exact(p_data,array['title','description','category','price','contact','images'])
 or not onecampus_private.text_ok(p_data,'title',3,100) or not onecampus_private.text_ok(p_data,'description',10,2000)
 or not onecampus_private.enum_ok(p_data,'category',array['Textbooks','Electronics','Stationery','Other'])
 or jsonb_typeof(p_data->'price') is distinct from 'number' or (p_data->>'price')::numeric not between 0 and 100000
 or round((p_data->>'price')::numeric,2)<>(p_data->>'price')::numeric
 or not onecampus_private.text_ok(p_data,'contact',10,16) or p_data->>'contact' !~ '^\+?[0-9]{10,15}$'
 or jsonb_typeof(p_data->'images') is distinct from 'array' then raise exception 'Check the listing fields.'; end if;
 if jsonb_array_length(p_data->'images')>3 or exists(select 1 from jsonb_array_elements(p_data->'images') v where jsonb_typeof(v)<>'string' or length(v#>>'{}')>280000 or (v#>>'{}') !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$') then raise exception 'Use up to 3 compressed JPEG images.'; end if;
 select name into strict n from public.profiles where id=u;
 insert into public.marketplace_listings(id,seller_id,seller_name,title,description,category,price,contact,images,created_at,updated_at)
 values(p_id,u,n,btrim(p_data->>'title'),btrim(p_data->>'description'),p_data->>'category',(p_data->>'price')::numeric,p_data->>'contact',p_data->'images',t,t) returning * into r;
 return to_jsonb(r);
end $$;
create function onecampus_private.change_listing(p_id uuid,p_status text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=onecampus_private.require_user(); r public.marketplace_listings; a boolean:=onecampus_private.is_admin();
begin
 select * into r from public.marketplace_listings where id=p_id for update;
 if not found or (r.seller_id<>u and not a) then raise exception 'Listing not accessible.' using errcode='42501'; end if;
 if p_status is null or p_status not in ('sold','removed') or r.status<>'available' then raise exception 'This listing is no longer available.'; end if;
 if a and r.seller_id<>u and p_status<>'removed' then raise exception 'Only the seller can mark an item sold.'; end if;
 if p_status='removed' and a and (p_reason is null or length(btrim(p_reason)) not between 3 and 300) then raise exception 'Add a removal reason (3–300 characters).'; end if;
 update public.marketplace_listings set status=p_status,removal_reason=case when a and p_status='removed' then btrim(p_reason) else '' end,updated_at=onecampus_private.now_ms() where id=p_id returning * into r;
 return to_jsonb(r);
end $$;
create function onecampus_private.save_meal(p_category text,p_start integer,p_end integer,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform onecampus_private.require_user(); if not onecampus_private.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
 if p_category is null or p_category not in ('Breakfast','Lunch','Snacks','Dinner') or p_start is null or p_end is null or p_enabled is null or p_start not between 0 and 1439 or p_end not between 0 and 1439 or p_start=p_end then raise exception 'Choose valid, different start and end times.'; end if;
 -- Keep receipt prices fixed; changes to opening times never alter old orders.
 update public.meal_services set start_minute=p_start,end_minute=p_end,enabled=p_enabled where category=p_category;
end $$;
create function onecampus_private.save_food(p_id uuid,p_category text,p_name text,p_description text,p_available boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.food_items;
begin
 perform onecampus_private.require_user(); if not onecampus_private.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
 if p_id is null or p_name is null or length(btrim(p_name)) not between 2 and 100 or p_description is null or length(btrim(p_description)) not between 3 and 500 or p_available is null then raise exception 'Check the food item details.'; end if;
 -- Serialize menu edits with order snapshots for the same meal.
 perform 1 from public.meal_services where category=p_category for update;
 if not found then raise exception 'Unknown meal.'; end if;
 if exists(select 1 from public.food_items where id=p_id and category<>p_category) then raise exception 'An item cannot move between meals. Create a new item instead.'; end if;
 insert into public.food_items values(p_id,p_category,btrim(p_name),btrim(p_description),p_available) on conflict(id) do update set name=excluded.name,description=excluded.description,available=excluded.available returning * into r;
 return to_jsonb(r);
end $$;
create function onecampus_private.remove_food(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare c text;
begin
 perform onecampus_private.require_user(); if not onecampus_private.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
 select category into c from public.food_items where id=p_id;
 perform 1 from public.meal_services where category=c for update;
 delete from public.food_items where id=p_id;
end $$;
create function onecampus_private.prepare_food_order(p_id uuid,p_category text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=onecampus_private.require_user(); s public.meal_services; r public.food_orders; food jsonb; n text; e text; t bigint:=onecampus_private.now_ms();
begin
 -- Idempotency key belongs to one signed-in account; conflict cannot expose someone else's order.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into r from public.food_orders where id=p_id;
 if found then if r.user_id<>u then raise exception 'Order not accessible.' using errcode='42501'; end if; return to_jsonb(r); end if;
 select * into s from public.meal_services where category=p_category for update;
 if not found or not onecampus_private.meal_open(s) then raise exception 'This meal is closed. Please order during its serving time.'; end if;
 select jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description) order by name) into food from public.food_items where category=p_category and available;
 if food is null then raise exception 'No food is available for this meal yet.'; end if;
 select name into strict n from public.profiles where id=u;
 select coalesce(email,'') into strict e from auth.users where id=u;
 insert into public.food_orders(id,user_id,student_name,student_email,category,items,amount,created_at) values(p_id,u,n,e,p_category,food,s.price,t) returning * into r;
 return to_jsonb(r);
end $$;
create function onecampus_private.pay_food_order(p_id uuid,p_success boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=onecampus_private.require_user(); r public.food_orders; s public.meal_services; t bigint:=onecampus_private.now_ms();
begin
 select * into r from public.food_orders where id=p_id for update;
 if not found or r.user_id<>u then raise exception 'Order not accessible.' using errcode='42501'; end if;
 if r.payment_status='mock_paid' then return to_jsonb(r); end if;
 if r.payment_status<>'pending' then raise exception 'This order was cancelled. Start a new order.'; end if;
 if p_success is null then raise exception 'Select a simulated payment outcome.'; end if;
 if p_success then
  select * into s from public.meal_services where category=r.category for share;
  if t-r.created_at>=600000 or not onecampus_private.meal_open(s) then raise exception 'Checkout expired or meal closed. Start a new order during serving hours.'; end if;
  update public.food_orders set payment_status='mock_paid',transaction_id='DEMO-'||gen_random_uuid()::text,paid_at=t where id=p_id returning * into r;
 else update public.food_orders set payment_status='cancelled' where id=p_id returning * into r;
 end if;
 return to_jsonb(r);
end $$;
create function onecampus_private.collect_food_order(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.food_orders;
begin
 perform onecampus_private.require_user(); if not onecampus_private.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
 update public.food_orders set collected_at=coalesce(collected_at,onecampus_private.now_ms()) where id=p_id and payment_status='mock_paid' returning * into r;
 if not found then raise exception 'Only a paid demo receipt can be collected.'; end if;
 return to_jsonb(r);
end $$;

create function public.post_marketplace_listing(p_id uuid,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select onecampus_private.post_listing(p_id,p_data)$$;
create function public.change_marketplace_listing(p_id uuid,p_status text,p_reason text default '') returns jsonb language sql security invoker set search_path='' as $$select onecampus_private.change_listing(p_id,p_status,p_reason)$$;
create function public.save_meal_service(p_category text,p_start integer,p_end integer,p_enabled boolean) returns void language sql security invoker set search_path='' as $$select onecampus_private.save_meal(p_category,p_start,p_end,p_enabled)$$;
create function public.save_food_item(p_id uuid,p_category text,p_name text,p_description text,p_available boolean) returns jsonb language sql security invoker set search_path='' as $$select onecampus_private.save_food(p_id,p_category,p_name,p_description,p_available)$$;
create function public.remove_food_item(p_id uuid) returns void language sql security invoker set search_path='' as $$select onecampus_private.remove_food(p_id)$$;
create function public.prepare_food_order(p_id uuid,p_category text) returns jsonb language sql security invoker set search_path='' as $$select onecampus_private.prepare_food_order(p_id,p_category)$$;
create function public.pay_food_order(p_id uuid,p_success boolean) returns jsonb language sql security invoker set search_path='' as $$select onecampus_private.pay_food_order(p_id,p_success)$$;
create function public.collect_food_order(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select onecampus_private.collect_food_order(p_id)$$;
revoke execute on function onecampus_private.meal_open(public.meal_services),onecampus_private.post_listing(uuid,jsonb),onecampus_private.change_listing(uuid,text,text),onecampus_private.save_meal(text,integer,integer,boolean),onecampus_private.save_food(uuid,text,text,text,boolean),onecampus_private.remove_food(uuid),onecampus_private.prepare_food_order(uuid,text),onecampus_private.pay_food_order(uuid,boolean),onecampus_private.collect_food_order(uuid) from public,anon,authenticated,service_role;
grant execute on function onecampus_private.meal_open(public.meal_services),onecampus_private.post_listing(uuid,jsonb),onecampus_private.change_listing(uuid,text,text),onecampus_private.save_meal(text,integer,integer,boolean),onecampus_private.save_food(uuid,text,text,text,boolean),onecampus_private.remove_food(uuid),onecampus_private.prepare_food_order(uuid,text),onecampus_private.pay_food_order(uuid,boolean),onecampus_private.collect_food_order(uuid) to authenticated;
revoke execute on function public.post_marketplace_listing(uuid,jsonb),public.change_marketplace_listing(uuid,text,text),public.save_meal_service(text,integer,integer,boolean),public.save_food_item(uuid,text,text,text,boolean),public.remove_food_item(uuid),public.prepare_food_order(uuid,text),public.pay_food_order(uuid,boolean),public.collect_food_order(uuid) from public,anon,authenticated,service_role;
grant execute on function public.post_marketplace_listing(uuid,jsonb),public.change_marketplace_listing(uuid,text,text),public.save_meal_service(text,integer,integer,boolean),public.save_food_item(uuid,text,text,text,boolean),public.remove_food_item(uuid),public.prepare_food_order(uuid,text),public.pay_food_order(uuid,boolean),public.collect_food_order(uuid) to authenticated;

insert into public.meal_services values('Breakfast',60,420,600,true),('Lunch',100,720,870,true),('Snacks',60,960,1080,true),('Dinner',100,1140,1290,true);
-- Illustrative starting menus: administrators can replace these immediately.
insert into public.food_items(id,category,name,description) values
 ('b0000000-0000-4000-8000-000000000001','Breakfast','Idli & sambar','Steamed rice cakes, vegetable sambar and coconut chutney.'),
 ('b0000000-0000-4000-8000-000000000002','Breakfast','Fresh fruit & tea','Seasonal fruit with a cup of tea.'),
 ('b0000000-0000-4000-8000-000000000003','Lunch','Campus thali','Rice, roti, dal, seasonal vegetables and curd.'),
 ('b0000000-0000-4000-8000-000000000004','Snacks','Samosa & tea','Crisp vegetable samosas with chutney and tea.'),
 ('b0000000-0000-4000-8000-000000000005','Dinner','Roti, rice & curry','Fresh rotis, steamed rice, dal and vegetable curry.');

do $$ declare n text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach n in array array['marketplace_listings','meal_services','food_items','food_orders'] loop execute format('alter publication supabase_realtime add table public.%I',n); end loop;
 end if;
end $$;
notify pgrst,'reload schema';
