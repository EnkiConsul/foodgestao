ALTER TABLE public.company_members ADD COLUMN IF NOT EXISTS unidades_permitidas uuid[];
ALTER TABLE public.company_invites ADD COLUMN IF NOT EXISTS unidades_permitidas uuid[];

CREATE OR REPLACE FUNCTION private.unidades_permitidas(_user_id uuid, _company_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN cm.role IN ('owner','admin') THEN NULL
    WHEN cm.unidades_permitidas IS NULL OR cardinality(cm.unidades_permitidas) = 0 THEN NULL
    ELSE cm.unidades_permitidas
  END
  FROM public.company_members cm
  WHERE cm.user_id = _user_id AND cm.company_id = _company_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION private.unidades_permitidas(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.minhas_unidades_permitidas(_company_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.unidades_permitidas(auth.uid(), _company_id)
$$;

GRANT EXECUTE ON FUNCTION public.minhas_unidades_permitidas(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.unidade_liberada(_company_id uuid, _unidade_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _unidade_id IS NULL THEN true
    WHEN public.has_role(auth.uid(), 'super_admin') THEN true
    WHEN private.unidades_permitidas(auth.uid(), _company_id) IS NULL THEN true
    ELSE _unidade_id = ANY (private.unidades_permitidas(auth.uid(), _company_id))
  END
$$;

GRANT EXECUTE ON FUNCTION public.unidade_liberada(uuid, uuid) TO authenticated, service_role;