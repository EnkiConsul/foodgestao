ALTER FUNCTION private.dp_portal_decisao_legado(uuid) RENAME TO dp_portal_decisao_base;
REVOKE ALL ON FUNCTION private.dp_portal_decisao_base(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.dp_portal_decisao_base(uuid) TO service_role;

-- Aviso prévio após o último comparecimento: portal só para consulta
-- (documentos e desligamento), sem rotina, escala ou dados de colegas.
CREATE OR REPLACE FUNCTION private.dp_portal_decisao_legado(_user_id uuid)
 RETURNS TABLE(estado text, colaborador_id uuid, company_id uuid, acesso_ate date)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM private.dp_portal_decisao_base(_user_id) LIMIT 1;
  IF r.estado = 'ativo' AND EXISTS (
    SELECT 1 FROM public.dp_desligamento_processos p
    JOIN public.companies co ON co.id = r.company_id
    WHERE p.colaborador_id = r.colaborador_id
      AND p.status = 'aviso_em_curso'
      AND p.ultimo_comparecimento IS NOT NULL
      AND p.ultimo_comparecimento < (now() AT TIME ZONE COALESCE(NULLIF(co.timezone, ''), 'America/Sao_Paulo'))::date
  ) THEN
    RETURN QUERY SELECT 'aviso_pos_trabalho'::text, r.colaborador_id, r.company_id, r.acesso_ate;
    RETURN;
  END IF;
  RETURN QUERY SELECT r.estado, r.colaborador_id, r.company_id, r.acesso_ate;
END;
$$;
REVOKE ALL ON FUNCTION private.dp_portal_decisao_legado(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.dp_portal_decisao_legado(uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.dp_pode_ver_documentos(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (SELECT 1 FROM private.dp_portal_decisao(_user_id) d
    WHERE d.estado IN ('ativo','desligado_no_prazo','empresa_suspensa_leitura','aviso_pos_trabalho'));
$fn$;

CREATE OR REPLACE FUNCTION private.is_dp_colaborador_of_company(_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (SELECT 1 FROM private.dp_portal_decisao(_user_id) d
    WHERE d.estado IN ('ativo','desligado_no_prazo','empresa_suspensa_leitura','aviso_pos_trabalho')
      AND d.company_id = _company_id);
$fn$;

CREATE OR REPLACE FUNCTION public.dp_colaborador_of(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT d.colaborador_id FROM private.dp_portal_decisao(_user_id) d
  WHERE _user_id IS NOT NULL
    AND (_user_id = auth.uid()
      OR current_setting('request.jwt.claim.role', true) = 'service_role'
      OR auth.role() = 'service_role')
    AND d.estado IN ('ativo','desligado_no_prazo','empresa_suspensa_leitura','aviso_pos_trabalho');
$function$;

CREATE OR REPLACE FUNCTION public.dp_meu_acesso_portal()
RETURNS TABLE(estado text, colaborador_id uuid, company_id uuid, acesso_ate date, somente_documentos boolean, permitido boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT d.estado, d.colaborador_id, d.company_id, d.acesso_ate,
         d.estado IN ('desligado_no_prazo','empresa_suspensa_leitura','aviso_pos_trabalho'),
         d.estado IN ('ativo','desligado_no_prazo','empresa_suspensa_leitura','aviso_pos_trabalho')
  FROM private.dp_portal_decisao(auth.uid()) d
  WHERE auth.uid() IS NOT NULL;
$fn$;