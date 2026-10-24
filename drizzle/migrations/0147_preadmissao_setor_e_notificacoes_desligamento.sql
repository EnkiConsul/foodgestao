DO $migration$
DECLARE s text;
BEGIN
  s := pg_get_functiondef('public.dp_preadmissao_ativar_rotina(uuid,date,jsonb)'::regprocedure);
  IF position('v_setor uuid' in s) > 0 OR position('v_unidade uuid;' in s) = 0 THEN
    RAISE EXCEPTION 'Definição de ativação divergente; revisar antes de aplicar';
  END IF;
  s := replace(s, '  v_unidade uuid;', E'  v_unidade uuid;\n  v_setor uuid;');
  s := replace(s, '  IF v_cargo IS NULL OR v_unidade IS NULL THEN', $part$  v_setor := NULLIF(v_a->>'setor_id','')::uuid;
  IF v_setor IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_setores WHERE id = v_setor AND company_id = pa.company_id
      AND (unidade_id IS NULL OR unidade_id = v_unidade)
  ) THEN
    RAISE EXCEPTION 'Setor habitual incompatível com a empresa ou unidade.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_cargo IS NULL OR v_unidade IS NULL THEN$part$);
  s := replace(s, $part$  FOR v_dia IN SELECT * FROM jsonb_array_elements(p_jornada->'dias') LOOP$part$, $part$  FOR v_dia IN SELECT * FROM jsonb_array_elements(p_jornada->'dias') LOOP
    IF NULLIF(v_dia->>'setor_id','') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.dp_setores WHERE id = (v_dia->>'setor_id')::uuid AND company_id = pa.company_id
        AND (unidade_id IS NULL OR unidade_id = v_unidade)
    ) THEN
      RAISE EXCEPTION 'Setor do dia incompatível com a empresa ou unidade.' USING ERRCODE = 'check_violation';
    END IF;$part$);
  s := replace(s, '    cargo_id, unidade_id, regime, forma_pagamento', '    cargo_id, unidade_id, setor_id, regime, forma_pagamento');
  s := replace(s, '    v_cargo, v_unidade, ''freelancer''', '    v_cargo, v_unidade, v_setor, ''freelancer''');
  s := replace(s, $part$         NULLIF(d->>'setor_id','')::uuid$part$, $part$         CASE WHEN COALESCE((d->>'trabalha')::boolean,false)
           THEN COALESCE(NULLIF(d->>'setor_id','')::uuid, v_setor)
           ELSE NULLIF(d->>'setor_id','')::uuid END$part$);
  IF position('cargo_id, unidade_id, setor_id, regime' in s) = 0 OR position('THEN COALESCE(NULLIF(d->>''setor_id'','''')::uuid, v_setor)' in s) = 0 THEN
    RAISE EXCEPTION 'Herança de setor não aplicada integralmente';
  END IF;
  EXECUTE s;
END $migration$;

CREATE OR REPLACE FUNCTION public.dp_desligamento_notificar(v public.dp_desligamento_processos, p_admin boolean, p_titulo text, p_desc text, p_chave text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_nome text;
  v_titulo text := p_titulo;
  v_desc text := p_desc;
BEGIN
  SELECT user_id, NULLIF(btrim(nome),'') INTO v_user, v_nome
    FROM public.dp_colaboradores WHERE id = v.colaborador_id AND company_id = v.company_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_admin THEN
    v_nome := COALESCE(v_nome, 'Colaborador');
    v_titulo := v_nome || ': ' || CASE
      WHEN p_chave LIKE 'desl-venc:%' THEN 'Rescisão vencida'
      WHEN p_chave LIKE 'desl-prazo:%' THEN 'Prazo de rescisão'
      WHEN p_chave LIKE 'desl-sug:%' THEN 'Sugestão de quitação'
      WHEN p_chave LIKE 'desl-d2:%' THEN 'Desligamento'
      ELSE p_titulo END;
    v_desc := v_nome || ': ' || replace(COALESCE(p_desc,''), 'Para TED/compensação, a sugestão é pagar até ', 'A sugestão de quitação é até ');
    INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave)
    SELECT v.company_id, NULL, v.colaborador_id, 'desligamento_aviso', v_titulo, v_desc, 'dp_desligamento_processos', v.id, true, p_chave
      WHERE NOT EXISTS (SELECT 1 FROM public.dp_notificacoes WHERE chave = p_chave AND company_id = v.company_id);
  ELSE
    IF v_user IS NULL OR v.comunicacao_confirmada_em IS NULL THEN RETURN; END IF;
    INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave)
    SELECT v.company_id, v_user, v.colaborador_id, 'desligamento_aviso', v_titulo, v_desc, 'dp_desligamento_processos', v.id, false, p_chave
      WHERE NOT EXISTS (SELECT 1 FROM public.dp_notificacoes WHERE chave = p_chave AND company_id = v.company_id);
  END IF;
END $function$;
REVOKE ALL ON FUNCTION public.dp_desligamento_notificar(public.dp_desligamento_processos,boolean,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_notificar(public.dp_desligamento_processos,boolean,text,text,text) TO service_role;