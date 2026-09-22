-- =====================================================================
-- Conferências da ficha do colaborador (uso interno)
-- =====================================================================
CREATE OR REPLACE FUNCTION private.dp_colaborador_conferir(
  _company_id uuid,
  _dados jsonb,
  _colaborador_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cpf text := regexp_replace(COALESCE(_dados->>'cpf', ''), '\D', '', 'g');
  v_pix_tipo text := lower(btrim(COALESCE(_dados->>'pix_tipo', '')));
  v_pix_chave text := btrim(COALESCE(_dados->>'pix_chave', ''));
  v_titular_cpf text := regexp_replace(COALESCE(_dados->>'titular_cpf', ''), '\D', '', 'g');
BEGIN
  IF COALESCE(btrim(_dados->>'nome'), '') = '' THEN
    RAISE EXCEPTION 'COLAB_NOME_OBRIGATORIO';
  END IF;

  IF (_dados->>'cargo_id') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_cargos x WHERE x.id = (_dados->>'cargo_id')::uuid AND x.company_id = _company_id
  ) THEN RAISE EXCEPTION 'COLAB_CARGO_INVALIDO'; END IF;

  IF (_dados->>'unidade_id') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_unidades x WHERE x.id = (_dados->>'unidade_id')::uuid AND x.company_id = _company_id
  ) THEN RAISE EXCEPTION 'COLAB_UNIDADE_INVALIDA'; END IF;

  IF (_dados->>'setor_id') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_setores x WHERE x.id = (_dados->>'setor_id')::uuid AND x.company_id = _company_id
  ) THEN RAISE EXCEPTION 'COLAB_SETOR_INVALIDO'; END IF;

  IF (_dados->>'sindicato_id') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_sindicatos x WHERE x.id = (_dados->>'sindicato_id')::uuid AND x.company_id = _company_id
  ) THEN RAISE EXCEPTION 'COLAB_SINDICATO_INVALIDO'; END IF;

  IF v_cpf <> '' AND length(v_cpf) <> 11 THEN
    RAISE EXCEPTION 'COLAB_CPF_INVALIDO';
  END IF;

  IF v_cpf <> '' AND EXISTS (
    SELECT 1 FROM public.dp_colaboradores c
     WHERE c.company_id = _company_id
       AND c.deleted_at IS NULL
       AND regexp_replace(COALESCE(c.cpf, ''), '\D', '', 'g') = v_cpf
       AND (_colaborador_id IS NULL OR c.id <> _colaborador_id)
  ) THEN RAISE EXCEPTION 'COLAB_CPF_DUPLICADO'; END IF;

  -- Pagamento: só chave Pix do próprio colaborador (CPF ou celular) ou conta de
  -- titularidade dele.
  IF v_pix_chave <> '' OR v_pix_tipo <> '' THEN
    IF v_pix_tipo NOT IN ('cpf', 'celular') THEN
      RAISE EXCEPTION 'PIX_TIPO_NAO_PERMITIDO';
    END IF;
    IF v_pix_chave = '' THEN
      RAISE EXCEPTION 'PIX_CHAVE_OBRIGATORIA';
    END IF;
    IF v_pix_tipo = 'cpf' THEN
      IF length(regexp_replace(v_pix_chave, '\D', '', 'g')) <> 11 THEN
        RAISE EXCEPTION 'PIX_CHAVE_INVALIDA';
      END IF;
      IF v_cpf <> '' AND regexp_replace(v_pix_chave, '\D', '', 'g') <> v_cpf THEN
        RAISE EXCEPTION 'TITULAR_TERCEIRO_NAO_PERMITIDO';
      END IF;
    ELSE
      IF length(regexp_replace(v_pix_chave, '\D', '', 'g')) NOT BETWEEN 10 AND 13 THEN
        RAISE EXCEPTION 'PIX_CHAVE_INVALIDA';
      END IF;
    END IF;
  END IF;

  IF COALESCE((_dados->>'titular_proprio')::boolean, true) = false THEN
    RAISE EXCEPTION 'TITULAR_TERCEIRO_NAO_PERMITIDO';
  END IF;

  IF v_titular_cpf <> '' AND v_cpf <> '' AND v_titular_cpf <> v_cpf THEN
    RAISE EXCEPTION 'TITULAR_TERCEIRO_NAO_PERMITIDO';
  END IF;
END $$;

REVOKE ALL ON FUNCTION private.dp_colaborador_conferir(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.dp_colaborador_conferir(uuid, jsonb, uuid) TO service_role;

-- =====================================================================
-- Rotina oficial de cadastro/edição da ficha
-- =====================================================================
CREATE OR REPLACE FUNCTION public.dp_colaborador_salvar(
  p_dados jsonb,
  p_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bloqueadas text[] := ARRAY[
    'id','company_id','user_id','created_at','updated_at','deleted_at','deleted_by',
    'delete_reason','ativo','data_desligamento','desligado_em','desligado_por',
    'motivo_desligamento','acesso_portal_ate','aproval_status','email_portal'
  ];
  v_atual public.dp_colaboradores;
  v_company uuid;
  v_json jsonb;
  v_merge jsonb;
  v_cols text;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN
    RAISE EXCEPTION 'COLAB_DADOS_INVALIDOS';
  END IF;

  IF p_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('dp_colaborador:' || p_id::text, 0));
    SELECT * INTO v_atual FROM public.dp_colaboradores WHERE id = p_id AND deleted_at IS NULL;
    IF v_atual.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    v_company := v_atual.company_id;
  ELSE
    v_company := p_company_id;
    IF v_company IS NULL THEN RAISE EXCEPTION 'COLAB_EMPRESA_OBRIGATORIA'; END IF;
  END IF;

  IF NOT (
    private.is_company_admin_or_owner(auth.uid(), v_company)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_company AND c.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- Campos protegidos ficam fora; nomes de cadastro em CAIXA ALTA.
  v_json := p_dados - v_bloqueadas;
  IF v_json ? 'nome' THEN
    v_json := jsonb_set(v_json, '{nome}', to_jsonb(upper(btrim(COALESCE(v_json->>'nome', '')))));
  END IF;
  IF v_json ? 'nome_mae' AND COALESCE(v_json->>'nome_mae','') <> '' THEN
    v_json := jsonb_set(v_json, '{nome_mae}', to_jsonb(upper(btrim(v_json->>'nome_mae'))));
  END IF;
  IF v_json ? 'nome_pai' AND COALESCE(v_json->>'nome_pai','') <> '' THEN
    v_json := jsonb_set(v_json, '{nome_pai}', to_jsonb(upper(btrim(v_json->>'nome_pai'))));
  END IF;

  IF p_id IS NULL THEN
    v_json := v_json || jsonb_build_object('company_id', v_company, 'ativo', true, 'titular_proprio', true);
    v_merge := v_json;
  ELSE
    v_json := v_json || jsonb_build_object('titular_proprio', true);
    v_merge := to_jsonb(v_atual) || v_json;
  END IF;

  PERFORM private.dp_colaborador_conferir(v_company, v_merge, p_id);

  SELECT string_agg(quote_ident(c.column_name), ', ')
    INTO v_cols
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = 'dp_colaboradores'
     AND v_json ? c.column_name;

  IF v_cols IS NULL THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'COLAB_DADOS_INVALIDOS'; END IF;
    RETURN p_id;
  END IF;

  IF p_id IS NULL THEN
    EXECUTE format(
      'INSERT INTO public.dp_colaboradores (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::public.dp_colaboradores, $1) RETURNING id',
      v_cols
    ) USING v_json INTO v_id;
  ELSE
    EXECUTE format(
      'UPDATE public.dp_colaboradores SET (%1$s) = (SELECT %1$s FROM jsonb_populate_record(NULL::public.dp_colaboradores, $1)), updated_at = now() WHERE id = $2 RETURNING id',
      v_cols
    ) USING v_json, p_id INTO v_id;
  END IF;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.dp_colaborador_salvar(jsonb, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_salvar(jsonb, uuid, uuid) TO authenticated, service_role;

-- =====================================================================
-- Atualização do próprio cadastro pelo portal
-- =====================================================================
CREATE OR REPLACE FUNCTION public.dp_colaborador_perfil_atualizar(p_dados jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_permitidas text[] := ARRAY[
    'telefone','whatsapp','email_contato','endereco','pix_tipo','pix_chave',
    'titular_nome','titular_cpf','banco_codigo','banco_nome','agencia','conta',
    'conta_digito','conta_tipo'
  ];
  v_colab uuid;
  v_atual public.dp_colaboradores;
  v_json jsonb := '{}'::jsonb;
  v_chave text;
  v_cols text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  v_colab := public.dp_colaborador_ativo_of(auth.uid());
  IF v_colab IS NULL THEN RAISE EXCEPTION 'sem_acesso_portal'; END IF;

  SELECT * INTO v_atual FROM public.dp_colaboradores WHERE id = v_colab;

  FOREACH v_chave IN ARRAY v_permitidas LOOP
    IF p_dados ? v_chave THEN
      v_json := v_json || jsonb_build_object(v_chave, p_dados -> v_chave);
    END IF;
  END LOOP;

  IF v_json = '{}'::jsonb THEN RETURN v_colab; END IF;
  v_json := v_json || jsonb_build_object('titular_proprio', true);

  PERFORM private.dp_colaborador_conferir(v_atual.company_id, to_jsonb(v_atual) || v_json, v_colab);

  SELECT string_agg(quote_ident(c.column_name), ', ')
    INTO v_cols
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'dp_colaboradores' AND v_json ? c.column_name;

  EXECUTE format(
    'UPDATE public.dp_colaboradores SET (%1$s) = (SELECT %1$s FROM jsonb_populate_record(NULL::public.dp_colaboradores, $1)), updated_at = now() WHERE id = $2',
    v_cols
  ) USING v_json, v_colab;

  RETURN v_colab;
END $$;

REVOKE ALL ON FUNCTION public.dp_colaborador_perfil_atualizar(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_perfil_atualizar(jsonb) TO authenticated, service_role;

-- =====================================================================
-- Configuração de trabalho: salvar, encerrar, excluir
-- =====================================================================
CREATE OR REPLACE FUNCTION public.dp_colaborador_config_salvar(
  p_colaborador_id uuid,
  p_config jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid;
  v_inicio date := NULLIF(p_config->>'vigencia_inicio', '')::date;
  v_unidade uuid := NULLIF(p_config->>'unidade_id', '')::uuid;
  v_turno uuid := NULLIF(p_config->>'turno_padrao_id', '')::uuid;
  v_folga_var boolean := COALESCE((p_config->>'folga_variavel')::boolean, true);
  v_folga_dow smallint := NULLIF(p_config->>'folga_fixa_dow', '')::smallint;
  v_dias jsonb := COALESCE(p_config->'dias', '[]'::jsonb);
  v_aberta public.dp_colaborador_config_trabalho;
  v_id uuid;
  v_dia jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF v_inicio IS NULL THEN RAISE EXCEPTION 'CONFIG_VIGENCIA_OBRIGATORIA'; END IF;

  SELECT company_id INTO v_company FROM public.dp_colaboradores
   WHERE id = p_colaborador_id AND deleted_at IS NULL;
  IF v_company IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF NOT (
    private.is_company_admin_or_owner(auth.uid(), v_company)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_company AND c.user_id = auth.uid())
  ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('dp_colaborador_config:' || p_colaborador_id::text, 0));

  IF v_unidade IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_unidades u WHERE u.id = v_unidade AND u.company_id = v_company
  ) THEN RAISE EXCEPTION 'COLAB_UNIDADE_INVALIDA'; END IF;

  IF v_turno IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_turnos t WHERE t.id = v_turno AND t.company_id = v_company
  ) THEN RAISE EXCEPTION 'CONFIG_TURNO_INVALIDO'; END IF;

  IF v_folga_var = false AND (v_folga_dow IS NULL OR v_folga_dow < 0 OR v_folga_dow > 6) THEN
    RAISE EXCEPTION 'CONFIG_FOLGA_FIXA_INVALIDA';
  END IF;

  IF jsonb_array_length(v_dias) <> 7 THEN RAISE EXCEPTION 'CONFIG_DIAS_INVALIDOS'; END IF;

  FOR v_dia IN SELECT jsonb_array_elements(v_dias) LOOP
    IF (v_dia->>'dow')::int NOT BETWEEN 0 AND 6 THEN RAISE EXCEPTION 'CONFIG_DIAS_INVALIDOS'; END IF;
    IF (v_dia->>'turno_id') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.dp_turnos t WHERE t.id = (v_dia->>'turno_id')::uuid AND t.company_id = v_company
    ) THEN RAISE EXCEPTION 'CONFIG_TURNO_INVALIDO'; END IF;
    IF (v_dia->>'setor_id') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.dp_setores s WHERE s.id = (v_dia->>'setor_id')::uuid AND s.company_id = v_company
    ) THEN RAISE EXCEPTION 'COLAB_SETOR_INVALIDO'; END IF;
    IF COALESCE((v_dia->>'intervalo_minutos')::int, 0) < 0
       OR COALESCE((v_dia->>'intervalo_minutos')::int, 0) > 480 THEN
      RAISE EXCEPTION 'CONFIG_INTERVALO_INVALIDO';
    END IF;
  END LOOP;

  IF (SELECT count(DISTINCT (d->>'dow')::int) FROM jsonb_array_elements(v_dias) d) <> 7 THEN
    RAISE EXCEPTION 'CONFIG_DIAS_INVALIDOS';
  END IF;

  SELECT c.* INTO v_aberta FROM public.dp_colaborador_config_trabalho c
   WHERE c.colaborador_id = p_colaborador_id AND c.vigencia_fim IS NULL
   ORDER BY c.vigencia_inicio DESC LIMIT 1;

  IF v_aberta.id IS NOT NULL AND v_aberta.vigencia_inicio = v_inicio THEN
    v_id := v_aberta.id;
    UPDATE public.dp_colaborador_config_trabalho
       SET unidade_id = v_unidade,
           turno_padrao_id = v_turno,
           folga_variavel = v_folga_var,
           folga_fixa_dow = CASE WHEN v_folga_var THEN NULL ELSE v_folga_dow END,
           observacoes = NULLIF(btrim(COALESCE(p_config->>'observacoes','')), ''),
           updated_at = now()
     WHERE id = v_id;
    DELETE FROM public.dp_colaborador_config_dias WHERE config_id = v_id;
  ELSE
    IF v_aberta.id IS NOT NULL THEN
      UPDATE public.dp_colaborador_config_trabalho
         SET vigencia_fim = GREATEST(v_inicio - 1, vigencia_inicio), updated_at = now()
       WHERE id = v_aberta.id;
    END IF;

    INSERT INTO public.dp_colaborador_config_trabalho (
      company_id, colaborador_id, unidade_id, turno_padrao_id, folga_variavel,
      folga_fixa_dow, observacoes, vigencia_inicio
    ) VALUES (
      v_company, p_colaborador_id, v_unidade, v_turno, v_folga_var,
      CASE WHEN v_folga_var THEN NULL ELSE v_folga_dow END,
      NULLIF(btrim(COALESCE(p_config->>'observacoes','')), ''), v_inicio
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM public.dp_colaborador_config_trabalho
       WHERE colaborador_id = p_colaborador_id AND vigencia_inicio = v_inicio
       ORDER BY created_at DESC LIMIT 1;
      DELETE FROM public.dp_colaborador_config_dias WHERE config_id = v_id;
    END IF;
  END IF;

  INSERT INTO public.dp_colaborador_config_dias (
    company_id, config_id, dow, trabalha, turno_id, entrada, saida, intervalo_minutos, setor_id
  )
  SELECT v_company, v_id, (d->>'dow')::smallint,
         COALESCE((d->>'trabalha')::boolean, false),
         NULLIF(d->>'turno_id','')::uuid,
         CASE WHEN COALESCE((d->>'trabalha')::boolean,false) THEN NULLIF(d->>'entrada','')::time END,
         CASE WHEN COALESCE((d->>'trabalha')::boolean,false) THEN NULLIF(d->>'saida','')::time END,
         CASE WHEN COALESCE((d->>'trabalha')::boolean,false) THEN NULLIF(d->>'intervalo_minutos','')::int END,
         CASE WHEN COALESCE((d->>'trabalha')::boolean,false) THEN NULLIF(d->>'setor_id','')::uuid END
    FROM jsonb_array_elements(v_dias) d;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.dp_colaborador_config_salvar(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_config_salvar(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_colaborador_config_encerrar(p_config_id uuid, p_fim date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_cfg public.dp_colaborador_config_trabalho;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO v_cfg FROM public.dp_colaborador_config_trabalho WHERE id = p_config_id;
  IF v_cfg.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT (
    private.is_company_admin_or_owner(auth.uid(), v_cfg.company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_cfg.company_id AND c.user_id = auth.uid())
  ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  UPDATE public.dp_colaborador_config_trabalho
     SET vigencia_fim = GREATEST(COALESCE(p_fim, CURRENT_DATE), vigencia_inicio), updated_at = now()
   WHERE id = p_config_id;
END $$;

REVOKE ALL ON FUNCTION public.dp_colaborador_config_encerrar(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_config_encerrar(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_colaborador_config_excluir(p_config_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_cfg public.dp_colaborador_config_trabalho;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO v_cfg FROM public.dp_colaborador_config_trabalho WHERE id = p_config_id;
  IF v_cfg.id IS NULL THEN RETURN; END IF;
  IF NOT (
    private.is_company_admin_or_owner(auth.uid(), v_cfg.company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_cfg.company_id AND c.user_id = auth.uid())
  ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  DELETE FROM public.dp_colaborador_config_dias WHERE config_id = p_config_id;
  DELETE FROM public.dp_colaborador_config_trabalho WHERE id = p_config_id;
END $$;

REVOKE ALL ON FUNCTION public.dp_colaborador_config_excluir(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_config_excluir(uuid) TO authenticated, service_role;