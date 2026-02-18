
-- Create table for multiple attachments per transaction
CREATE TABLE public.transaction_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.transaction_attachments ENABLE ROW LEVEL SECURITY;

-- Users can manage their own attachments
CREATE POLICY "Users can manage own attachments"
ON public.transaction_attachments
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Company members can view company transaction attachments
CREATE POLICY "Company members can view company attachments"
ON public.transaction_attachments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.id = transaction_attachments.transaction_id
      AND t.company_id IS NOT NULL
      AND is_company_member(auth.uid(), t.company_id)
  )
);

-- Index for fast lookups
CREATE INDEX idx_transaction_attachments_transaction_id ON public.transaction_attachments(transaction_id);

-- Migrate existing attachment_url data to the new table
INSERT INTO public.transaction_attachments (transaction_id, user_id, file_name, file_url)
SELECT id, user_id, 'Anexo migrado', attachment_url
FROM public.transactions
WHERE attachment_url IS NOT NULL AND attachment_url != '';
