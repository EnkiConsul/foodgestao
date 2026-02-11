
-- Allow company members to view basic profile info of other members in same companies
CREATE POLICY "Company members can view member profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR user_id IN (
    SELECT cm.user_id
    FROM public.company_members cm
    WHERE cm.company_id IN (
      SELECT cm2.company_id
      FROM public.company_members cm2
      WHERE cm2.user_id = auth.uid()
    )
  )
);
