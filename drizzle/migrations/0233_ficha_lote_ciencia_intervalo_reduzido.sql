-- Ciência única do lote para intervalo reduzido (30 a 59 min em jornada acima de 6h).
-- Só vale com convenção/acordo coletivo (CLT art. 71 e art. 611-A, III): quem confere
-- declara uma vez no lote; autor e data são gravados pelo servidor, nunca pelo navegador.
CREATE OR REPLACE FUNCTION public.dp_ficha_lote_ajustar(p_importacao_id uuid, p_padroes jsonb DEFAULT NULL::jsonb, p_itens jsonb DEFAULT NULL::jsonb)
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
  v_pad jsonb;
  v_ciencia jsonb;
  v_just text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'SEM_SESSAO' USING ERRCODE = '42501'; END IF;

  SELECT company_id, coalesce(organizacao, '{}'::jsonb) INTO v_company, v_org
    FROM public.dp_ficha_importacoes WHERE id = p_importacao_id FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'LOTE_NAO_ENCONTRADO'; END IF;

  IF NOT (public.is_company_admin_or_owner(v_uid, v_company) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'SEM_PERMISSAO: apenas dono ou administrador ajusta o lote.' USING ERRCODE = '42501';
  END IF;

  IF p_padroes IS NOT NULL THEN
    v_pad := coalesce(v_org->'padroes', '{}'::jsonb) || private.dp_ficha_lote_escolhas(p_padroes, v_company, false);
    IF jsonb_typeof(p_padroes) = 'object' AND p_padroes ? 'intervalo_reduzido_ciencia' THEN
      v_ciencia := p_padroes->'intervalo_reduzido_ciencia';
      IF jsonb_typeof(v_ciencia) = 'null' THEN
        v_pad := v_pad || jsonb_build_object('intervalo_reduzido_ciencia', null);
      ELSIF jsonb_typeof(v_ciencia) = 'object'
        AND (v_ciencia->'ciente') = 'true'::jsonb
        AND jsonb_typeof(v_ciencia->'justificativa') = 'string' THEN
        v_just := btrim(v_ciencia->>'justificativa');
        IF length(v_just) < 15 OR length(v_just) > 500 THEN
          RAISE EXCEPTION 'AJUSTE_INVALIDO: justificativa do intervalo reduzido (15 a 500 caracteres).';
        END IF;
        v_pad := v_pad || jsonb_build_object('intervalo_reduzido_ciencia',
          jsonb_build_object('justificativa', v_just, 'ciente', true, 'em', now(), 'por', v_uid));
      ELSE
        RAISE EXCEPTION 'AJUSTE_INVALIDO: ciência do intervalo reduzido.';
      END IF;
    END IF;
    v_org := v_org || jsonb_build_object('padroes', v_pad);
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