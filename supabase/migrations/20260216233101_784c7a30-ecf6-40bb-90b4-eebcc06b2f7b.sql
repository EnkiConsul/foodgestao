
-- Audit logs table
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_name text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only super admins can read
CREATE POLICY "Super admins can view audit logs"
ON public.audit_logs
FOR SELECT
USING (is_super_admin(auth.uid()));

-- Security definer function to insert logs (bypasses RLS)
CREATE OR REPLACE FUNCTION public.insert_audit_log(
  _action text,
  _entity_type text,
  _entity_id text DEFAULT NULL,
  _details jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_name text;
BEGIN
  SELECT full_name INTO _user_name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  
  INSERT INTO public.audit_logs (user_id, user_name, action, entity_type, entity_id, details)
  VALUES (auth.uid(), _user_name, _action, _entity_type, _entity_id, _details);
END;
$$;
