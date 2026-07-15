DROP POLICY IF EXISTS "Authenticated users can read CNPJ cache" ON public.cnpj_cache;
REVOKE SELECT ON public.cnpj_cache FROM authenticated;
REVOKE SELECT ON public.cnpj_cache FROM anon;