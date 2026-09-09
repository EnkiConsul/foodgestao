CREATE OR REPLACE FUNCTION public.my_pending_invites()
RETURNS TABLE (
  id uuid,
  token text,
  company_id uuid,
  company_name text,
  role text,
  expires_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id,
         i.token,
         i.company_id,
         coalesce(c.trade_name, c.name) AS company_name,
         i.role::text,
         i.expires_at,
         i.created_at
  FROM public.company_invites i
  JOIN public.companies c ON c.id = i.company_id
  WHERE auth.uid() IS NOT NULL
    AND i.status = 'pending'
    AND i.expires_at > now()
    AND lower(i.invited_email) = lower(coalesce(auth.jwt() ->> 'email', '###'))
  ORDER BY i.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.my_pending_invites() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_pending_invites() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_pending_invites() TO authenticated;