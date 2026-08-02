CREATE TABLE public.pluggy_connect_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  item_id_to_update text,
  resolved_item_id text,
  status text NOT NULL DEFAULT 'open',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 minutes'),
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pluggy_connect_requests_status_chk CHECK (status IN ('open','completed','expired','error'))
);

GRANT SELECT ON public.pluggy_connect_requests TO authenticated;
GRANT ALL ON public.pluggy_connect_requests TO service_role;

ALTER TABLE public.pluggy_connect_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pluggy_connect_requests_member_read"
ON public.pluggy_connect_requests
FOR SELECT
TO authenticated
USING (
  user_id = (select auth.uid())
  OR company_id IN (
    SELECT cm.company_id FROM public.company_members cm
    WHERE cm.user_id = (select auth.uid())
  )
);

CREATE INDEX idx_pluggy_connect_requests_user_status
  ON public.pluggy_connect_requests (user_id, status, created_at DESC);
CREATE INDEX idx_pluggy_connect_requests_company_status
  ON public.pluggy_connect_requests (company_id, status, created_at DESC);
CREATE INDEX idx_pluggy_connect_requests_resolved_item
  ON public.pluggy_connect_requests (resolved_item_id);

CREATE TRIGGER trg_pluggy_connect_requests_updated_at
BEFORE UPDATE ON public.pluggy_connect_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();