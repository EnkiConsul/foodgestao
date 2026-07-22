DROP POLICY IF EXISTS "Authenticated users can delete attachments" ON storage.objects;

CREATE POLICY "Authenticated users can delete attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'transaction-attachments'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);