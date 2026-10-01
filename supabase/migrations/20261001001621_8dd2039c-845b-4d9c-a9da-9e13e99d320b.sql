CREATE OR REPLACE FUNCTION public.dp_admissao_regra_parentesco_definir(p_company_id uuid, p_parentesco text, p_dependente boolean, p_sesc boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p text := lower(btrim(coalesce(p_parentesco,'')));
BEGIN
  PERFORM private.dp_regras_admin(p_company_id);
  IF v_p = '' OR length(v_p) > 40 OR v_p !~ '^[a-z0-9_ ]+$' THEN RAISE EXCEPTION 'REGRA_PARENTESCO_INVALIDO'; END IF;
  PERFORM private.dp_regras_fila(format('parentesco|%s|%s', p_company_id, upper(v_p)));
  INSERT INTO public.dp_admissao_regra_parentescos (company_id, parentesco, permite_dependente, permite_sesc)
  VALUES (p_company_id, v_p, coalesce(p_dependente,false), coalesce(p_sesc,false))
  ON CONFLICT (company_id, parentesco) DO UPDATE
    SET permite_dependente = excluded.permite_dependente, permite_sesc = excluded.permite_sesc, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.dp_admissao_regra_parentesco_definir(uuid,text,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_admissao_regra_parentesco_definir(uuid,text,boolean,boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_admissao_regra_parentesco_remover(p_company_id uuid, p_parentesco text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM private.dp_regras_admin(p_company_id);
  PERFORM private.dp_regras_fila(format('parentesco|%s|%s', p_company_id, upper(btrim(p_parentesco))));
  DELETE FROM public.dp_admissao_regra_parentescos WHERE company_id = p_company_id AND parentesco = lower(btrim(p_parentesco));
  PERFORM private.dp_regras_hist(p_company_id, 'Parentesco de admissão — removido', NULL, jsonb_build_object('parentesco', p_parentesco), NULL, NULL, false);
END $$;
REVOKE ALL ON FUNCTION public.dp_admissao_regra_parentesco_remover(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_admissao_regra_parentesco_remover(uuid,text) TO authenticated, service_role;

DO $$ DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.dp_preadmissao_salvar_candidato(uuid,text[],text,jsonb,jsonb,jsonb,integer)'::regprocedure) INTO v_def;
  IF position('IF NOT (v_par_norm = ANY (c_parentescos)) THEN' IN v_def) = 0 THEN RAISE EXCEPTION 'Validacao de parentesco alterada: revisar antes de migrar'; END IF;
  v_def := replace(v_def,
    'IF NOT (v_par_norm = ANY (c_parentescos)) THEN',
    'IF NOT (v_par_norm = ANY (c_parentescos)) AND NOT EXISTS (SELECT 1 FROM public.dp_admissao_regra_parentescos x WHERE x.company_id = pa.company_id AND public.dp_txt_norm(x.parentesco) = v_par_norm) THEN');
  v_def := replace(v_def,
    'IF v_sesc AND NOT (v_par_norm = ANY (c_sesc)) THEN',
    'IF v_sesc AND NOT (v_par_norm = ANY (c_sesc)) AND NOT EXISTS (SELECT 1 FROM public.dp_admissao_regra_parentescos x WHERE x.company_id = pa.company_id AND public.dp_txt_norm(x.parentesco) = v_par_norm AND x.permite_sesc) THEN');
  IF position('IF NOT v_dep AND NOT v_sesc THEN' IN v_def) = 0 THEN RAISE EXCEPTION 'Validacao de finalidade alterada: revisar antes de migrar'; END IF;
  v_def := replace(v_def, 'IF NOT v_dep AND NOT v_sesc THEN',
    'IF EXISTS (SELECT 1 FROM public.dp_admissao_regra_parentescos x WHERE x.company_id = pa.company_id)
      AND NOT EXISTS (SELECT 1 FROM public.dp_admissao_regra_parentescos x WHERE x.company_id = pa.company_id AND public.dp_txt_norm(x.parentesco) = v_par_norm AND (NOT v_dep OR x.permite_dependente) AND (NOT v_sesc OR x.permite_sesc) AND (v_dep OR v_sesc)) THEN
        RETURN jsonb_build_object(''ok'', false, ''motivo'', ''pessoa_parentesco'', ''indice'', idx);
      END IF;
      IF NOT v_dep AND NOT v_sesc THEN');
  EXECUTE v_def;
END $$;

DO $$ DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.dp_documento_requisitos_seed(uuid)'::regprocedure) INTO v_def;
  IF position('(_company_id,''cnh_sem_suspensao'',''Declaração de CNH sem suspensão''' IN v_def) = 0 THEN RAISE EXCEPTION 'Lista padrao de documentos alterada: revisar antes de migrar'; END IF;
  v_def := regexp_replace(v_def, '\s*\(_company_id,\s*''cnh_sem_suspensao''[^\n]*\n', E'\n', 'g');
  EXECUTE v_def;
END $$;