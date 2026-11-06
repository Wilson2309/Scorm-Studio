-- Private buckets only. Existing buckets with these names cause a rollback, not an overwrite.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('scorm-pdfs','scorm-pdfs',false,20971520,array['application/pdf']),
 ('scorm-packages','scorm-packages',false,10485760,array['application/zip']);

create policy workspace_pdf_read on storage.objects for select to authenticated using (
 bucket_id='scorm-pdfs' and exists(select 1 from public.documents d where d.user_id=(select auth.uid()) and d.storage_path=name)
);
create policy workspace_pdf_insert on storage.objects for insert to authenticated with check (
 bucket_id='scorm-pdfs' and exists(select 1 from public.documents d where d.user_id=(select auth.uid()) and d.storage_path=name and d.status='UPLOADED' and d.deleting_at is null)
);
create policy workspace_pdf_delete on storage.objects for delete to authenticated using (
 bucket_id='scorm-pdfs' and exists(select 1 from public.documents d where d.user_id=(select auth.uid()) and d.storage_path=name and d.deleting_at is not null)
);
create policy workspace_package_read on storage.objects for select to authenticated using (
 -- Owner may read historical versions and inspect/delete a failed upload. Only the
 -- authenticated application download route advertises the validated CURRENT ZIP.
 bucket_id='scorm-packages' and exists(select 1 from public.scorm_packages p where p.user_id=(select auth.uid()) and p.storage_path=name)
);
create policy workspace_package_insert on storage.objects for insert to authenticated with check (
 bucket_id='scorm-packages' and exists(select 1 from public.scorm_packages p join public.generations g on g.id=p.generation_id and g.user_id=p.user_id
  where p.user_id=(select auth.uid()) and p.storage_path=name and p.status='UPLOADING' and g.active_operation=p.operation_id and g.current_revision=p.revision and g.deleting_at is null)
);
create policy workspace_package_delete on storage.objects for delete to authenticated using (
 bucket_id='scorm-packages' and exists(select 1 from public.scorm_packages p join public.generations g on g.id=p.generation_id and g.user_id=p.user_id
  where p.user_id=(select auth.uid()) and p.storage_path=name and (p.status in ('FAILED','OBSOLETE','UPLOADING') or g.deleting_at is not null))
);
-- There is deliberately no UPDATE/upsert permission on either bucket.
commit;
