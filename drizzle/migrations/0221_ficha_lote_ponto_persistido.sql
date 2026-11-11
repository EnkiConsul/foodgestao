-- Rascunho do lote guarda a decisão de ponto (e o motivo da dispensa) de cada ficha.
CREATE OR REPLACE FUNCTION private.dp_ficha_lote_escolhas(p jsonb, p_company uuid, p_com_dados boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb := '{}'::jsonb;
  v_id uuid;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RAISE EXCEPTION 'AJUSTE_INVALIDO'; END IF;

  IF p ? 'regime' THEN
    IF jsonb_typeof(p->'regime') = 'null' THEN v := v || jsonb_build_object('regime', null);
    ELSIF p->>'regime' = ANY (ARRAY['clt','intermitente','estagio','temporario','pj','mei','freelancer']) THEN
      v := v || jsonb_build_object('regime', p->>'regime');
    ELSE RAISE EXCEPTION 'AJUSTE_INVALIDO: vínculo desconhecido.'; END IF;
  END IF;

  IF p ? 'forma_pagamento' THEN
    IF jsonb_typeof(p->'forma_pagamento') = 'null' THEN v := v || jsonb_build_object('forma_pagamento', null);
    ELSIF p->>'forma_pagamento' = ANY (ARRAY['mensalista','horista','diarista','semanal','por_turno','servico_acordo']) THEN
      v := v || jsonb_build_object('forma_pagamento', p->>'forma_pagamento');
    ELSE RAISE EXCEPTION 'AJUSTE_INVALIDO: forma de pagamento desconhecida.'; END IF;
  END IF;

  IF p ? 'adiantamento' THEN
    IF jsonb_typeof(p->'adiantamento') NOT IN ('null', 'boolean') THEN RAISE EXCEPTION 'AJUSTE_INVALIDO: adiantamento.'; END IF;
    v := v || jsonb_build_object('adiantamento', p->'adiantamento');
  END IF;

  IF p ? 'folha_ponto' THEN
    IF jsonb_typeof(p->'folha_ponto') NOT IN ('null', 'boolean') THEN RAISE EXCEPTION 'AJUSTE_INVALIDO: folha de ponto.'; END IF;
    v := v || jsonb_build_object('folha_ponto', p->'folha_ponto');
  END IF;

  IF p ? 'folha_ponto_justificativa' THEN
    IF jsonb_typeof(p->'folha_ponto_justificativa') = 'null' THEN
      v := v || jsonb_build_object('folha_ponto_justificativa', null);
    ELSIF jsonb_typeof(p->'folha_ponto_justificativa') = 'string' AND length(p->>'folha_ponto_justificativa') <= 500 THEN
      v := v || jsonb_build_object('folha_ponto_justificativa', NULLIF(btrim(p->>'folha_ponto_justificativa'), ''));
    ELSE RAISE EXCEPTION 'AJUSTE_INVALIDO: motivo da dispensa de ponto.'; END IF;
  END IF;

  IF p ? 'turno_id' THEN
    IF jsonb_typeof(p->'turno_id') = 'null' THEN v := v || jsonb_build_object('turno_id', null);
    ELSE
      v_id := (p->>'turno_id')::uuid;
      IF NOT EXISTS (SELECT 1 FROM public.dp_turnos WHERE id = v_id AND company_id = p_company) THEN
        RAISE EXCEPTION 'AJUSTE_INVALIDO: turno de outra empresa.';
      END IF;
      v := v || jsonb_build_object('turno_id', v_id);
    END IF;
  END IF;

  IF p_com_dados THEN
    IF p ? 'cargo_id' THEN
      IF jsonb_typeof(p->'cargo_id') = 'null' THEN v := v || jsonb_build_object('cargo_id', null);
      ELSE
        v_id := (p->>'cargo_id')::uuid;
        IF NOT EXISTS (SELECT 1 FROM public.dp_cargos WHERE id = v_id AND company_id = p_company) THEN
          RAISE EXCEPTION 'AJUSTE_INVALIDO: cargo de outra empresa.';
        END IF;
        v := v || jsonb_build_object('cargo_id', v_id);
      END IF;
    END IF;
    IF p ? 'setor_id' THEN
      IF jsonb_typeof(p->'setor_id') = 'null' THEN v := v || jsonb_build_object('setor_id', null);
      ELSE
        v_id := (p->>'setor_id')::uuid;
        IF NOT EXISTS (SELECT 1 FROM public.dp_setores WHERE id = v_id AND company_id = p_company) THEN
          RAISE EXCEPTION 'AJUSTE_INVALIDO: setor de outra empresa.';
        END IF;
        v := v || jsonb_build_object('setor_id', v_id);
      END IF;
    END IF;
    IF p ? 'dados' THEN
      IF jsonb_typeof(p->'dados') <> 'object' OR octet_length((p->'dados')::text) > 20000 THEN
        RAISE EXCEPTION 'AJUSTE_INVALIDO: dados da ficha.';
      END IF;
      v := v || jsonb_build_object('dados', p->'dados');
    END IF;
  END IF;

  RETURN v;
END $function$;

REVOKE ALL ON FUNCTION private.dp_ficha_lote_escolhas(jsonb, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- A aplicação da ficha passa a gravar o motivo da dispensa de ponto: sem ele o
-- gatilho dp_colab_ponto_clt_padrao religava o ponto de CLT em unidade com relógio.
DO $do$
DECLARE
  f text;
  v_antes text := '''naturalidade'',''raca_cor'',''grau_instrucao'',''deficiencia''';
BEGIN
  SELECT pg_get_functiondef('public.dp_ficha_aplicar(uuid,jsonb,jsonb,text[],boolean,uuid,uuid,uuid,uuid,text,text,boolean,boolean,jsonb)'::regprocedure) INTO f;
  IF position('''folha_ponto_dispensa_justificativa''' in f) > 0 THEN RETURN; END IF;
  IF position(v_antes in f) = 0 THEN
    RAISE EXCEPTION 'dp_ficha_aplicar: lista de campos permitidos não encontrada.';
  END IF;
  f := replace(f, v_antes, v_antes || ',''folha_ponto_dispensa_justificativa''');
  EXECUTE f;
END $do$;