
-- 1. Profile data leakage: restrict co-member SELECT to safe fields via a view
DROP POLICY IF EXISTS "Company members can view member profiles" ON public.profiles;

CREATE OR REPLACE VIEW public.company_member_profiles
WITH (security_invoker = true) AS
SELECT p.user_id, p.full_name, p.avatar_url
FROM public.profiles p
WHERE p.user_id = auth.uid()
   OR p.user_id IN (
     SELECT cm.user_id
     FROM public.company_members cm
     WHERE cm.company_id IN (SELECT private.get_user_company_ids(auth.uid()))
   );

GRANT SELECT ON public.company_member_profiles TO authenticated;

-- 2. Storage: restrict transaction-attachments SELECT to owner only
DROP POLICY IF EXISTS "Authenticated users can view attachments" ON storage.objects;
CREATE POLICY "Users can view own attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'transaction-attachments'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
UPDATE storage.buckets SET public = false WHERE id = 'transaction-attachments';

-- 3. Realtime: restrict channel subscriptions to user's own topics
DROP POLICY IF EXISTS "Users can subscribe to own topics" ON realtime.messages;
CREATE POLICY "Users can subscribe to own topics"
ON realtime.messages FOR SELECT TO authenticated
USING (
  realtime.topic() LIKE 'sync-pf-' || auth.uid()::text || '-%'
  OR EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND realtime.topic() LIKE 'sync-pj-' || cm.company_id::text || '-%'
  )
);

-- 4. Coupons: require authentication to read
DROP POLICY IF EXISTS "Anyone can read active coupons" ON public.coupons;
CREATE POLICY "Authenticated users can read active coupons"
ON public.coupons FOR SELECT TO authenticated
USING (is_active = true);

-- 5. Transaction tags: allow company members
DROP POLICY IF EXISTS "Company members can manage company transaction tags" ON public.transaction_tags;
CREATE POLICY "Company members can manage company transaction tags"
ON public.transaction_tags FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_tags.transaction_id
      AND t.company_id IS NOT NULL
      AND private.is_company_member(auth.uid(), t.company_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_tags.transaction_id
      AND t.company_id IS NOT NULL
      AND private.is_company_member(auth.uid(), t.company_id)
  )
);

-- 6. Revoke anon EXECUTE on SECURITY DEFINER function
REVOKE EXECUTE ON FUNCTION public.get_user_plan_features(uuid) FROM anon, PUBLIC;
