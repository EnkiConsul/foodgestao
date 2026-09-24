CREATE OR REPLACE FUNCTION private.colaborador_unidade_liberada(_colaborador_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN _colaborador_id IS NULL THEN true
    ELSE coalesce((SELECT public.unidade_liberada(c.company_id, c.unidade_id) OR c.user_id = auth.uid()
                   FROM public.dp_colaboradores c WHERE c.id = _colaborador_id), true) END
$$;
REVOKE ALL ON FUNCTION private.colaborador_unidade_liberada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.colaborador_unidade_liberada(uuid) TO authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dp_folgas','dp_folgas_canceladas','dp_ferias_periodos','dp_ferias_gozos','dp_solicitacoes','dp_indisponibilidades','dp_escala_itens','dp_colaborador_jornadas','dp_dependentes','dp_colaborador_documentos','dp_registros_disciplinares'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS escopo_unidade_colab ON public.%I', t);
    EXECUTE format('CREATE POLICY escopo_unidade_colab ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (private.colaborador_unidade_liberada(colaborador_id)) WITH CHECK (private.colaborador_unidade_liberada(colaborador_id))', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.dp_colaboradores_confidencial(_company_id uuid, _ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id uuid, liberado boolean, salario_base numeric, base_salarial numeric, cpf text, rg_numero text, rg_orgao text, rg_uf text, rg_emissao date, pis_nit text, banco_codigo text, banco_nome text, agencia text, conta text, conta_digito text, conta_tipo text, pix_tipo text, pix_chave text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ler boolean;
  v_ver boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  v_ler := public.is_super_admin(v_uid)
           OR private.dp_pode_ler_empresa(_company_id) AND public.tem_permissao(_company_id, 'dp.colaboradores', 'consulta');
  v_ver := private.pode_ver_salarios(v_uid, _company_id);
  RETURN QUERY
  SELECT c.id, (v_ver OR c.user_id = v_uid),
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.salario_base END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.base_salarial END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.cpf
         WHEN c.cpf IS NULL THEN NULL
         ELSE '***.' || coalesce(substr(regexp_replace(c.cpf,'\D','','g'),4,3),'***') || '.'
              || coalesce(substr(regexp_replace(c.cpf,'\D','','g'),7,3),'***') || '-**' END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.rg_numero WHEN c.rg_numero IS NULL THEN NULL ELSE '••••' END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.rg_orgao END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.rg_uf END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.rg_emissao END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.pis_nit WHEN c.pis_nit IS NULL THEN NULL ELSE '••••' END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.banco_codigo END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.banco_nome END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.agencia WHEN c.agencia IS NULL THEN NULL ELSE '••••' END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.conta WHEN c.conta IS NULL THEN NULL ELSE '••••' END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.conta_digito END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.conta_tipo END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.pix_tipo END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.pix_chave WHEN c.pix_chave IS NULL THEN NULL ELSE '••••' END
  FROM public.dp_colaboradores c
  WHERE c.company_id = _company_id
    AND (_ids IS NULL OR c.id = ANY(_ids))
    AND (c.user_id = v_uid OR (v_ler AND public.unidade_liberada(_company_id, c.unidade_id)));
END $function$;