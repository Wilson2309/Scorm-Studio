-- Exact temporary resources from the observed acceptance run; read only.
select jsonb_build_object(
 'temporaryAuthUsers',(select count(*) from auth.users where id in ('85bf4c83-61dd-4a12-849a-4478580db3d3','a24891b3-0d0a-4478-bb20-a9c258dc9b03')),
 'temporaryProfiles',(select count(*) from public.profiles where id in ('85bf4c83-61dd-4a12-849a-4478580db3d3','a24891b3-0d0a-4478-bb20-a9c258dc9b03')),
 'temporaryDocuments',(select count(*) from public.documents where user_id in ('85bf4c83-61dd-4a12-849a-4478580db3d3','a24891b3-0d0a-4478-bb20-a9c258dc9b03')),
 'temporaryGenerations',(select count(*) from public.generations where user_id in ('85bf4c83-61dd-4a12-849a-4478580db3d3','a24891b3-0d0a-4478-bb20-a9c258dc9b03')),
 'temporaryStorageObjects',(select count(*) from storage.objects where name like '85bf4c83-61dd-4a12-849a-4478580db3d3/%' or name like 'a24891b3-0d0a-4478-bb20-a9c258dc9b03/%'),
 'roleCounts',(select jsonb_agg(t) from (select role,count(*) from public.profiles group by role)t)
) as cleanup;
