CREATE OR REPLACE FUNCTION public.dp_colaboradores_ajustar_lote(
  p_company_id uuid,
  p_dados jsonb,
  p_ids uuid[] DEFAULT NULL,
  p_cargo_id uuid DEFAULT NULL,
  p_somente_ativos boolean DEFAULT false
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_chave text;
  v_cols text;
  v_total integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_company_id IS NULL THEN RAISE EXCEPTION 'COLAB_EMPRESA_OBRIGATORIA'; END IF;
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' OR p_dados = '{}'::jsonb THEN
    RAISE EXCEPTION 'COLAB_DADOS_INVALIDOS';
  END IF;

  IF NOT (
    private.is_company_admin_or_owner(auth.uid(), p_company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = p_company_id AND c.user_id = auth.uid())
  ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  IF p_ids IS NULL AND p_cargo_id IS NULL AND p_somente_ativos IS NOT TRUE THEN
    RAISE EXCEPTION 'COLAB_LOTE_SEM_ALVO';
  END IF;

  -- Somente campos de benefícios, adicionais e folga fixa podem ser ajustados em lote.
  FOR v_chave IN SELECT jsonb_object_keys(p_dados) LOOP
    IF NOT (
      v_chave ~ '^(vale_alimentacao|vale_transporte|premio_assiduidade|assiduidade_)'
      OR v_chave IN ('insalubridade_percentual', 'periculosidade_percentual', 'adicional_percentual', 'folga_fixa_semana')
    ) THEN
      RAISE EXCEPTION 'COLAB_CAMPO_NAO_PERMITIDO';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
       WHERE c.table_schema = 'public' AND c.table_name = 'dp_colaboradores' AND c.column_name = v_chave
    ) THEN RAISE EXCEPTION 'COLAB_CAMPO_NAO_PERMITIDO'; END IF;
  END LOOP;

  SELECT string_agg(quote_ident(c.column_name), ', ')
    INTO v_cols
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'dp_colaboradores' AND p_dados ? c.column_name;

  EXECUTE format(
    'UPDATE public.dp_colaboradores SET (%1$s) = (SELECT %1$s FROM jsonb_populate_record(NULL::public.dp_colaboradores, $1)), updated_at = now()
      WHERE company_id = $2
        AND deleted_at IS NULL
        AND ($3::uuid[] IS NULL OR id = ANY($3))
        AND ($4::uuid IS NULL OR cargo_id = $4)
        AND ($5 IS NOT TRUE OR data_desligamento IS NULL)',
    v_cols
  ) USING p_dados, p_company_id, p_ids, p_cargo_id, p_somente_ativos;

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END $$;

REVOKE ALL ON FUNCTION public.dp_colaboradores_ajustar_lote(uuid, jsonb, uuid[], uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_colaboradores_ajustar_lote(uuid, jsonb, uuid[], uuid, boolean) TO authenticated, service_role;