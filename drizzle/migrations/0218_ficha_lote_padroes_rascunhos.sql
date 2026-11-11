-- Padrões do lote e rascunho por ficha: só preenchem a conferência, nunca criam colaborador.
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

CREATE OR REPLACE FUNCTION public.dp_ficha_lote_ajustar(p_importacao_id uuid, p_padroes jsonb DEFAULT NULL, p_itens jsonb DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_org jsonb;
  v_ajustes jsonb;
  v_item text;
  v_val jsonb;
  v_n int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'SEM_SESSAO' USING ERRCODE = '42501'; END IF;

  SELECT company_id, coalesce(organizacao, '{}'::jsonb) INTO v_company, v_org
    FROM public.dp_ficha_importacoes WHERE id = p_importacao_id FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'LOTE_NAO_ENCONTRADO'; END IF;

  IF NOT (public.is_company_admin_or_owner(v_uid, v_company) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'SEM_PERMISSAO: apenas dono ou administrador ajusta o lote.' USING ERRCODE = '42501';
  END IF;

  IF p_padroes IS NOT NULL THEN
    v_org := v_org || jsonb_build_object(
      'padroes', coalesce(v_org->'padroes', '{}'::jsonb) || private.dp_ficha_lote_escolhas(p_padroes, v_company, false));
  END IF;

  IF p_itens IS NOT NULL THEN
    IF jsonb_typeof(p_itens) <> 'object' THEN RAISE EXCEPTION 'AJUSTE_INVALIDO'; END IF;
    v_ajustes := coalesce(v_org->'ajustes', '{}'::jsonb);
    FOR v_item, v_val IN SELECT * FROM jsonb_each(p_itens) LOOP
      v_n := v_n + 1;
      IF v_n > 500 THEN RAISE EXCEPTION 'AJUSTE_INVALIDO: fichas demais de uma vez.'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.dp_ficha_importacao_itens
         WHERE id = v_item::uuid AND importacao_id = p_importacao_id
           AND status IN ('pendente', 'revisar', 'duplicado')
      ) THEN
        RAISE EXCEPTION 'FICHA_INVALIDA: a ficha não está pendente neste lote.';
      END IF;
      v_ajustes := v_ajustes || jsonb_build_object(
        v_item, coalesce(v_ajustes->v_item, '{}'::jsonb) || private.dp_ficha_lote_escolhas(v_val, v_company, true)
          || jsonb_build_object('em', now(), 'por', v_uid));
    END LOOP;
    v_org := v_org || jsonb_build_object('ajustes', v_ajustes);
  END IF;

  UPDATE public.dp_ficha_importacoes SET organizacao = v_org WHERE id = p_importacao_id;
  RETURN v_org;
END $function$;

REVOKE ALL ON FUNCTION public.dp_ficha_lote_ajustar(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ficha_lote_ajustar(uuid, jsonb, jsonb) TO authenticated;