CREATE OR REPLACE FUNCTION public.dp_aviso_salvar(p_company_id uuid, p_aviso jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_patch jsonb; v_id uuid := nullif(p_aviso->>'id','')::uuid; v_pub jsonb;
  v_permitidos text[] := ARRAY['titulo','conteudo','prioridade','escopo','unidade_id','cargo_id',
    'colaborador_id','publicado_em','expira_em','fixado','arquivo_path','arquivo_mime',
    'leitura_obrigatoria','permitir_reacoes','permitir_comentarios','publico'];
BEGIN
  PERFORM private.dp_regras_admin(p_company_id);
  v_patch := private.dp_regras_campos(p_aviso, v_permitidos);

  IF length(btrim(coalesce(v_patch->>'titulo',''))) < 3 THEN RAISE EXCEPTION 'AVISO_TITULO_INVALIDO'; END IF;
  IF length(btrim(coalesce(v_patch->>'titulo',''))) > 200 THEN RAISE EXCEPTION 'AVISO_TITULO_INVALIDO'; END IF;
  IF nullif(btrim(coalesce(v_patch->>'conteudo','')),'') IS NULL THEN RAISE EXCEPTION 'AVISO_CONTEUDO_INVALIDO'; END IF;
  IF length(v_patch->>'conteudo') > 20000 THEN RAISE EXCEPTION 'AVISO_CONTEUDO_INVALIDO'; END IF;
  IF v_patch ? 'prioridade' AND (v_patch->>'prioridade') NOT IN ('baixa','normal','alta','urgente') THEN
    RAISE EXCEPTION 'AVISO_PRIORIDADE_INVALIDA';
  END IF;
  IF v_patch ? 'escopo' AND (v_patch->>'escopo') NOT IN ('todos','unidade','cargo','colaborador','segmentado') THEN
    RAISE EXCEPTION 'AVISO_ESCOPO_INVALIDO';
  END IF;

  IF coalesce(v_patch->>'escopo','') = 'segmentado' THEN
    v_pub := coalesce(v_patch->'publico','{}'::jsonb);
    IF jsonb_typeof(v_pub) <> 'object' THEN RAISE EXCEPTION 'AVISO_PUBLICO_INVALIDO'; END IF;
    IF (SELECT coalesce(sum(CASE WHEN jsonb_typeof(v_pub->k)='array' THEN jsonb_array_length(v_pub->k) ELSE 0 END),0)
        FROM unnest(ARRAY['unidades','cargos','setores','sindicatos','regimes','colaboradores']) k) = 0 THEN
      RAISE EXCEPTION 'AVISO_PUBLICO_VAZIO';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(v_pub->'unidades','[]')) x
               WHERE NOT EXISTS (SELECT 1 FROM dp_unidades u WHERE u.id::text = x AND u.company_id = p_company_id))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(v_pub->'cargos','[]')) x
               WHERE NOT EXISTS (SELECT 1 FROM dp_cargos u WHERE u.id::text = x AND u.company_id = p_company_id))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(v_pub->'setores','[]')) x
               WHERE NOT EXISTS (SELECT 1 FROM dp_setores u WHERE u.id::text = x AND u.company_id = p_company_id))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(v_pub->'sindicatos','[]')) x
               WHERE NOT EXISTS (SELECT 1 FROM dp_sindicatos u WHERE u.id::text = x AND u.company_id = p_company_id))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(v_pub->'colaboradores','[]')) x
               WHERE NOT EXISTS (SELECT 1 FROM dp_colaboradores u WHERE u.id::text = x AND u.company_id = p_company_id))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(v_pub->'regimes','[]')) x
               WHERE x NOT IN ('clt','pj','estagio','temporario','mei','intermitente','freelancer')) THEN
      RAISE EXCEPTION 'AVISO_PUBLICO_INVALIDO';
    END IF;
    v_patch := v_patch || jsonb_build_object('unidade_id', null, 'cargo_id', null, 'colaborador_id', null, 'publico', v_pub);
  ELSIF v_patch ? 'escopo' THEN
    v_patch := v_patch || jsonb_build_object('publico', null);
  END IF;

  PERFORM private.dp_regras_escopo(
    p_company_id,
    nullif(v_patch->>'unidade_id','')::uuid,
    nullif(v_patch->>'cargo_id','')::uuid,
    NULL, NULL,
    nullif(v_patch->>'colaborador_id','')::uuid
  );

  IF v_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.dp_avisos WHERE id = v_id AND company_id = p_company_id) THEN
      RAISE EXCEPTION 'NOT_FOUND';
    END IF;
    PERFORM private.dp_regras_atualizar('public.dp_avisos'::regclass, v_id, v_patch, true);
  ELSE
    v_id := private.dp_regras_inserir(
      'public.dp_avisos'::regclass,
      v_patch || jsonb_build_object('company_id', p_company_id, 'autor_id', auth.uid())
    );
  END IF;
  RETURN v_id;
END $function$;