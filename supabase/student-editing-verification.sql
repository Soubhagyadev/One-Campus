-- Controlled live verification. All synthetic users/posts/events are rolled back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values('f9944101-f999-4999-8999-999999999901','qa-editing-a@onecampus.example','{"name":"QA Author"}'),('f9944101-f999-4999-8999-999999999902','qa-editing-b@onecampus.example','{"name":"QA Other"}'),('f9944101-f999-4999-8999-999999999903','qa-editing-c@onecampus.example','{"name":"QA Admin"}');
update public.profiles set role='admin' where id='f9944101-f999-4999-8999-999999999903';
set local role authenticated;
select set_config('request.jwt.claim.sub','f9944101-f999-4999-8999-999999999903',true);
select public.create_event('qa-editing-event',$data${"title": "Synthetic editing workshop", "club": "Coding Club", "date": 2000000000000, "venue": "QA hall", "description": "A synthetic upcoming event used only during a rolled-back verification.", "tags": ["Workshop"]}$data$::jsonb);
select set_config('request.jwt.claim.sub','f9944101-f999-4999-8999-999999999901',true);
select public.submit_report('qa-editing-report',$data${"ownerUid": "f9944101-f999-4999-8999-999999999901", "type": "issue", "category": "Other", "department": "Administration", "priority": "medium", "title": "Synthetic report workflow check", "description": "A synthetic report used only in a rolled-back verification transaction.", "location": "Library help desk", "image": "", "photoSafe": false, "safeDetails": {"intent": "issue", "topic": "Other", "item": "Other item", "color": "Not specified", "feature": "Not specified", "urgency": "medium"}, "customDetails": {"topic": "Access card question", "item": "Scientific calculator", "color": ""}, "contactNumber": "9999999999", "contactAddress": "Campus help desk", "visibility": "campus", "status": "Submitted", "deadline": 0, "aiSummary": "Route this synthetic report to campus administration.", "aiSource": "Local fallback", "matchSource": "Local fallback", "comments": [], "matches": [], "timeline": [], "createdAt": 0, "resolvedAt": null, "demo": false}$data$::jsonb);
select public.create_team_post('qa-editing-team',$data${"eventId": "qa-editing-event", "kind": "looking", "skills": ["Frontend"], "roles": [], "theme": "Open innovation", "idea": "A synthetic campus tool team for rolled-back testing."}$data$::jsonb);
select public.post_marketplace_listing('f9944101-f999-4999-8999-999999999911',$data${"title": "Synthetic textbook listing", "description": "A synthetic listing used only in this rolled-back test.", "category": "Textbooks", "price": 200, "contact": "9999999999", "images": []}$data$::jsonb);
select set_config('request.jwt.claim.sub','f9944101-f999-4999-8999-999999999903',true);
select public.update_report('qa-editing-report','In Progress','QA official progress update.');
select set_config('request.jwt.claim.sub','f9944101-f999-4999-8999-999999999901',true);
select public.edit_own_report('qa-editing-report',$data${"title": "Updated synthetic report", "description": "Updated details for the same synthetic campus report.", "location": "QA library desk", "contactNumber": "9999999999", "visibility": "campus"}$data$::jsonb);
select public.edit_team_post('qa-editing-team',$data${"eventId": "qa-editing-event", "kind": "looking", "skills": ["Frontend"], "roles": [], "theme": "Open innovation", "idea": "An updated synthetic team idea visible to campus students."}$data$::jsonb);
select public.edit_marketplace_listing('f9944101-f999-4999-8999-999999999911',$data${"title": "Synthetic textbook listing", "description": "A synthetic listing used only in this rolled-back test.", "category": "Textbooks", "price": 150, "contact": "9999999999", "images": []}$data$::jsonb);
select set_config('request.jwt.claim.sub','f9944101-f999-4999-8999-999999999902',true);
do $$ declare blocked boolean:=false; begin begin perform public.edit_own_report('qa-editing-report',$data${"title": "Updated synthetic report", "description": "Updated details for the same synthetic campus report.", "location": "QA library desk", "contactNumber": "9999999999", "visibility": "campus"}$data$::jsonb); exception when insufficient_privilege then blocked:=true; end; assert blocked; end $$;
do $$ begin
 assert exists(select 1 from public.reports where id='qa-editing-report' and status='In Progress' and payload->>'title'='Updated synthetic report');
 assert exists(select 1 from public.team_posts where id='qa-editing-team' and payload->>'idea'='An updated synthetic team idea visible to campus students.');
 assert exists(select 1 from public.marketplace_listings where id='f9944101-f999-4999-8999-999999999911' and price=150 and status='available');
end $$;
select true as student_editing_verified;
rollback;
