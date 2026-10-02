ALTER TABLE public.dp_unidades
  ADD COLUMN IF NOT EXISTS relogio_ponto_dispensa_justificativa text,
  ADD COLUMN IF NOT EXISTS relogio_ponto_dispensa_em timestamptz,
  ADD COLUMN IF NOT EXISTS relogio_ponto_dispensa_por uuid;

CREATE OR REPLACE FUNCTION public.dp_unidade_definir_ponto(
  _unidade_id uuid, _possui boolean, _justificativa text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid; v_ativos int; v_just text := nullif(btrim(coalesce(_justificativa,'')), ''); v_qtd int := 0;
BEGIN
  SELECT company_id INTO v_company FROM dp_unidades WHERE id = _unidade_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Unidade não encontrada.'; END IF;
  IF NOT tem_permissao(v_company, 'dp.cadastros', 'alteracao') THEN
    RAISE EXCEPTION 'Sem permissão para alterar o ponto desta unidade.' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_ativos FROM dp_colaboradores
   WHERE unidade_id = _unidade_id AND ativo AND deleted_at IS NULL AND data_desligamento IS NULL;

  IF _possui THEN
    UPDATE dp_unidades SET possui_relogio_ponto = true,
      relogio_ponto_dispensa_justificativa = NULL, relogio_ponto_dispensa_em = NULL, relogio_ponto_dispensa_por = NULL
     WHERE id = _unidade_id;
    UPDATE dp_colaboradores SET possui_folha_ponto = true
     WHERE unidade_id = _unidade_id AND ativo AND deleted_at IS NULL AND data_desligamento IS NULL
       AND regime IN ('clt','temporario','intermitente')
       AND coalesce(possui_folha_ponto,false) = false
       AND nullif(btrim(coalesce(folha_ponto_dispensa_justificativa,'')),'') IS NULL;
    GET DIAGNOSTICS v_qtd = ROW_COUNT;
  ELSE
    IF v_ativos > 20 AND (v_just IS NULL OR length(v_just) < 10) THEN
      RAISE EXCEPTION 'A unidade tem mais de 20 colaboradores ativos: justifique a dispensa do ponto (Art. 74 da CLT).';
    END IF;
    UPDATE dp_unidades SET possui_relogio_ponto = false,
      relogio_ponto_dispensa_justificativa = v_just,
      relogio_ponto_dispensa_em = CASE WHEN v_just IS NULL THEN NULL ELSE now() END,
      relogio_ponto_dispensa_por = CASE WHEN v_just IS NULL THEN NULL ELSE auth.uid() END
     WHERE id = _unidade_id;
    UPDATE dp_colaboradores SET possui_folha_ponto = false
     WHERE unidade_id = _unidade_id AND deleted_at IS NULL AND coalesce(possui_folha_ponto,true) = true;
    GET DIAGNOSTICS v_qtd = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('ativos', v_ativos, 'colaboradores_alterados', v_qtd);
END $$;

REVOKE ALL ON FUNCTION public.dp_unidade_definir_ponto(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_unidade_definir_ponto(uuid, boolean, text) TO authenticated, service_role;