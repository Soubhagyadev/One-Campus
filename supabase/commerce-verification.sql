-- Controlled live verification: all synthetic users, listings, orders and schedule changes roll back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('f7744101-f777-4777-8777-777777777701','commerce-qa-a@onecampus.example','{"name":"Commerce QA Student"}'),
 ('f7744101-f777-4777-8777-777777777702','commerce-qa-b@onecampus.example','{"name":"Commerce QA Admin"}');
update public.profiles set role='admin' where id='f7744101-f777-4777-8777-777777777702';
update public.meal_services set enabled=true,start_minute=(extract(hour from statement_timestamp() at time zone 'Asia/Kolkata')::int*60+extract(minute from statement_timestamp() at time zone 'Asia/Kolkata')::int+1439)%1440,end_minute=(extract(hour from statement_timestamp() at time zone 'Asia/Kolkata')::int*60+extract(minute from statement_timestamp() at time zone 'Asia/Kolkata')::int+30)%1440 where category='Lunch';
set local role authenticated;
select set_config('request.jwt.claim.sub','f7744101-f777-4777-8777-777777777701',true);
select public.post_marketplace_listing('f7744101-f777-4777-8777-777777777711','{"title":"QA textbook","description":"Synthetic QA listing, rolled back after verification.","category":"Textbooks","price":250,"contact":"9999999999","images":[]}');
select public.prepare_food_order('f7744101-f777-4777-8777-777777777712','Lunch');
select public.pay_food_order('f7744101-f777-4777-8777-777777777712',true);
do $$ declare o public.food_orders; begin
 select * into strict o from public.food_orders where id='f7744101-f777-4777-8777-777777777712';
 assert o.amount=100 and o.payment_status='mock_paid' and o.transaction_id like 'DEMO-%' and o.student_name='Commerce QA Student';
end $$;
select set_config('request.jwt.claim.sub','f7744101-f777-4777-8777-777777777702',true);
select public.change_marketplace_listing('f7744101-f777-4777-8777-777777777711','removed','Synthetic moderation test');
select public.collect_food_order('f7744101-f777-4777-8777-777777777712');
select status='removed' as moderation_passed from public.marketplace_listings where id='f7744101-f777-4777-8777-777777777711';
select amount=100 and payment_status='mock_paid' and collected_at is not null as receipt_passed from public.food_orders where id='f7744101-f777-4777-8777-777777777712';
rollback;
