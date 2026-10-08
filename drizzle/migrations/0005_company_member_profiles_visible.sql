CREATE OR REPLACE VIEW public.company_member_profiles
WITH (security_invoker = false, security_barrier = true) AS
SELECT p.user_id, p.full_name, p.avatar_url
FROM public.profiles p
WHERE p.user_id = auth.uid()
   OR p.user_id IN (
     SELECT cm.user_id FROM public.company_members cm
     WHERE cm.company_id IN (SELECT private.get_user_company_ids(auth.uid()))
   )
   OR p.user_id IN (
     SELECT c.user_id FROM public.companies c
     WHERE c.id IN (SELECT private.get_user_company_ids(auth.uid()))
   );
REVOKE ALL ON public.company_member_profiles FROM anon;
GRANT SELECT ON public.company_member_profiles TO authenticated;