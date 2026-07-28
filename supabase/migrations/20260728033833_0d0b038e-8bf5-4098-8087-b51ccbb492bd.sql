-- Feature flag por empresa
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS pluggy_version text NOT NULL DEFAULT 'v1'
    CHECK (pluggy_version IN ('v1', 'v2'));

CREATE INDEX IF NOT EXISTS idx_companies_pluggy_version ON public.companies(pluggy_version);

-- RPC: super_admin muda versão
CREATE OR REPLACE FUNCTION public.set_company_pluggy_version(
  _company_id uuid,
  _version text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _version NOT IN ('v1', 'v2') THEN
    RAISE EXCEPTION 'invalid_version:%', _version;
  END IF;

  SELECT pluggy_version INTO v_current FROM public.companies WHERE id = _company_id;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'company_not_found:%', _company_id;
  END IF;

  UPDATE public.companies
     SET pluggy_version = _version,
         updated_at = now()
   WHERE id = _company_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'company.pluggy_version.change',
    'company',
    _company_id,
    jsonb_build_object('from', v_current, 'to', _version)
  );

  RETURN _version;
END;
$$;

REVOKE ALL ON FUNCTION public.set_company_pluggy_version(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_company_pluggy_version(uuid, text) TO authenticated;

-- RPC: leitura da versão (RLS-friendly via SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.get_company_pluggy_version(_company_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT pluggy_version FROM public.companies WHERE id = _company_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_company_pluggy_version(uuid) TO authenticated;