
-- 1) Restrict coupon enumeration: drop the policy that lets any authenticated user list active coupons.
DROP POLICY IF EXISTS "Authenticated users can read active coupons" ON public.coupons;

-- 2) Allow company members to download attachments belonging to company transactions.
CREATE POLICY "Company members can read company transaction attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'transaction-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.transactions t
    JOIN public.company_members cm ON cm.company_id = t.company_id
    WHERE t.id::text = (storage.foldername(name))[2]
      AND cm.user_id = auth.uid()
  )
);
