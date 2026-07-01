alter table feedback add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback', 'feedback', true, 5242880, array['image/jpeg','image/jpg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'authenticated_upload_feedback'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated_upload_feedback" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''feedback'')';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'public_read_feedback'
  ) THEN
    EXECUTE 'CREATE POLICY "public_read_feedback" ON storage.objects FOR SELECT USING (bucket_id = ''feedback'')';
  END IF;
END$$;
