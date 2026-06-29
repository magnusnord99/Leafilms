alter table feedback add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback', 'feedback', true, 5242880, array['image/jpeg','image/jpg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

create policy "authenticated_upload_feedback" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'feedback');

create policy "public_read_feedback" on storage.objects
  for select using (bucket_id = 'feedback');
