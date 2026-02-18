
-- Create storage bucket for transaction attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('transaction-attachments', 'transaction-attachments', true);

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'transaction-attachments' AND auth.uid() IS NOT NULL);

-- Allow authenticated users to view their files
CREATE POLICY "Authenticated users can view attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'transaction-attachments' AND auth.uid() IS NOT NULL);

-- Allow users to delete their own attachments
CREATE POLICY "Authenticated users can delete attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'transaction-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to update their own attachments
CREATE POLICY "Authenticated users can update attachments"
ON storage.objects FOR UPDATE
USING (bucket_id = 'transaction-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
