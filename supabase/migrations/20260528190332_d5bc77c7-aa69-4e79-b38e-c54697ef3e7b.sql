DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to own folder" ON storage.objects;

CREATE POLICY "Users can upload to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'transaction-attachments'
  AND auth.uid() IS NOT NULL
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can update own attachments" ON storage.objects;
CREATE POLICY "Users can update own attachments"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'transaction-attachments'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'transaction-attachments'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);