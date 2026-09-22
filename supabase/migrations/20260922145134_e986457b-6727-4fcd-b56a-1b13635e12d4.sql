-- =====================================================================
-- Fase 9 Pessoas 360: cadastros de remuneração e benefícios
-- Rollback: DROP das funções criadas, DROP das colunas removido_*,
-- recriar políticas *_write_admin com FOR ALL e reconceder
-- INSERT/UPDATE/DELETE em authenticated nas 6 tabelas.
-- =====================================================================

-- 1) Exclusão lógica ---------------------------------------------------
ALTER TABLE public.dp_cargos ADD COLUMN IF NOT EXISTS removido_em timestamptz,
  ADD COLUMN IF NOT EXISTS removido_por uuid, ADD COLUMN IF NOT EXISTS removido_motivo text;
ALTER TABLE public.dp_cargo_salarios ADD COLUMN IF NOT EXISTS removido_em timestamptz,
  ADD COLUMN IF NOT EXISTS removido_por uuid, ADD COLUMN IF NOT EXISTS removido_motivo text;
ALTER TABLE public.dp_beneficios ADD COLUMN IF NOT EXISTS removido_em timestamptz,
  ADD COLUMN IF NOT EXISTS removido_por uuid, ADD COLUMN IF NOT EXISTS removido_motivo text;
ALTER TABLE public.dp_beneficios_padroes ADD COLUMN IF NOT EXISTS removido_em timestamptz,
  ADD COLUMN IF NOT EXISTS removido_por uuid, ADD COLUMN IF NOT EXISTS removido_motivo text;
ALTER TABLE public.dp_adicionais_tempo_servico ADD COLUMN IF NOT EXISTS removido_em timestamptz,
  ADD COLUMN IF NOT EXISTS removido_por uuid, ADD COLUMN IF NOT EXISTS removido_motivo text;
ALTER TABLE public.dp_colaborador_beneficios ADD COLUMN IF NOT EXISTS removido_em timestamptz,
  ADD COLUMN IF NOT EXISTS removido_por uuid, ADD COLUMN IF NOT EXISTS removido_motivo text;

CREATE INDEX IF NOT EXISTS idx_dp_cargos_ativos ON public.dp_cargos(company_id) WHERE removido_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_dp_cargo_salarios_ativos ON public.dp_cargo_salarios(company_id, cargo_id) WHERE removido_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_dp_beneficios_ativos ON public.dp_beneficios(company_id) WHERE removido_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_dp_beneficios_padroes_ativos ON public.dp_beneficios_padroes(company_id) WHERE removido_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_dp_adic_ts_ativos ON public.dp_adicionais_tempo_servico(company_id) WHERE removido_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_dp_colab_beneficios_ativos ON public.dp_colaborador_beneficios(colaborador_id, beneficio_id) WHERE removido_em IS NULL;

-- 2) Conferências reutilizáveis ---------------------------------------
CREATE OR REPLACE FUNCTION private.dp_remuneracao_admin(_company_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'REM_EMPRESA_OBRIGATORIA'; END IF;
  IF NOT (private.is_company_admin_or_owner(auth.uid(), _company_id)
          OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.dp_json_campos_check(_dados jsonb, _permitidos text[])
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE k text;
BEGIN
  IF _dados IS NULL OR jsonb_typeof(_dados) <> 'object' THEN
    RAISE EXCEPTION 'REM_DADOS_INVALIDOS';
  END IF;
  FOR k IN SELECT jsonb_object_keys(_dados) LOOP
    IF NOT (k = ANY(_permitidos)) THEN
      RAISE EXCEPTION 'REM_CAMPO_NAO_PERMITIDO:%', k;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.dp_faixa_check(_valor numeric, _min numeric, _max numeric, _codigo text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _valor IS NULL THEN RETURN; END IF;
  IF _valor < _min OR _valor > _max THEN RAISE EXCEPTION '%', _codigo; END IF;
END $$;

CREATE OR REPLACE FUNCTION private.dp_remuneracao_escopo_check(
  _company_id uuid, _unidade_id uuid, _cargo_id uuid, _sindicato_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _unidade_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_unidades WHERE id = _unidade_id AND company_id = _company_id
  ) THEN RAISE EXCEPTION 'REM_UNIDADE_INVALIDA'; END IF;
  IF _cargo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_cargos WHERE id = _cargo_id AND company_id = _company_id AND removido_em IS NULL
  ) THEN RAISE EXCEPTION 'REM_CARGO_INVALIDO'; END IF;
  IF _sindicato_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_sindicatos WHERE id = _sindicato_id AND company_id = _company_id
  ) THEN RAISE EXCEPTION 'REM_SINDICATO_INVALIDO'; END IF;
END $$;

REVOKE ALL ON FUNCTION private.dp_remuneracao_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_json_campos_check(jsonb, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_faixa_check(numeric, numeric, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_remuneracao_escopo_check(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 3) Cargo -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_cargo_salvar(p_dados jsonb, p_company_id uuid, p_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.dp_cargos; v_id uuid := p_id; v_nome text;
BEGIN
  PERFORM private.dp_remuneracao_admin(p_company_id);
  PERFORM private.dp_json_campos_check(p_dados, ARRAY[
    'nome','cbo','salario_base','ativo','descricao','insalubre_periculoso','exige_cnh',
    'cnh_categoria_minima','exige_epi','insalubre','perigoso','insalubridade_percentual',
    'periculosidade_percentual','base_horas_mes','base_dias_mes']);

  IF v_id IS NULL THEN
    v_nome := upper(btrim(coalesce(p_dados->>'nome','')));
    IF v_nome = '' THEN RAISE EXCEPTION 'REM_CARGO_NOME_OBRIGATORIO'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('dp_cargo:' || p_company_id::text || ':' || v_nome, 0));
    SELECT id INTO v_id FROM public.dp_cargos
     WHERE company_id = p_company_id AND removido_em IS NULL AND upper(btrim(nome)) = v_nome
     LIMIT 1;
    IF v_id IS NULL THEN
      INSERT INTO public.dp_cargos(company_id, nome) VALUES (p_company_id, v_nome) RETURNING * INTO v_row;
    END IF;
  END IF;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.dp_cargos WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF v_row.company_id <> p_company_id THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    IF v_row.removido_em IS NOT NULL THEN RAISE EXCEPTION 'REM_REGISTRO_EXCLUIDO'; END IF;
  END IF;

  v_row := jsonb_populate_record(v_row, p_dados);
  v_row.nome := upper(btrim(coalesce(v_row.nome,'')));
  IF v_row.nome = '' THEN RAISE EXCEPTION 'REM_CARGO_NOME_OBRIGATORIO'; END IF;
  PERFORM private.dp_faixa_check(v_row.salario_base, 0, 1000000, 'REM_SALARIO_INVALIDO');
  PERFORM private.dp_faixa_check(v_row.insalubridade_percentual, 0, 100, 'REM_PERCENTUAL_INVALIDO');
  PERFORM private.dp_faixa_check(v_row.periculosidade_percentual, 0, 100, 'REM_PERCENTUAL_INVALIDO');
  PERFORM private.dp_faixa_check(v_row.base_horas_mes, 0, 744, 'REM_BASE_HORAS_INVALIDA');
  PERFORM private.dp_faixa_check(v_row.base_dias_mes, 0, 31, 'REM_BASE_DIAS_INVALIDA');

  UPDATE public.dp_cargos SET
    nome = v_row.nome, cbo = v_row.cbo, salario_base = v_row.salario_base, ativo = v_row.ativo,
    descricao = v_row.descricao, insalubre_periculoso = v_row.insalubre_periculoso,
    exige_cnh = v_row.exige_cnh, cnh_categoria_minima = v_row.cnh_categoria_minima,
    exige_epi = v_row.exige_epi, insalubre = v_row.insalubre, perigoso = v_row.perigoso,
    insalubridade_percentual = v_row.insalubridade_percentual,
    periculosidade_percentual = v_row.periculosidade_percentual,
    base_horas_mes = v_row.base_horas_mes, base_dias_mes = v_row.base_dias_mes
   WHERE id = v_row.id;
  RETURN v_row.id;
END $$;

-- 4) Piso salarial do cargo -------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_cargo_piso_definir(
  p_dados jsonb, p_id uuid DEFAULT NULL, p_justificativa text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.dp_cargo_salarios; v_company uuid; v_cargo uuid; v_unidade uuid; v_sind uuid;
  v_inicio date; v_anterior jsonb; v_id uuid := p_id; v_aberta record;
BEGIN
  PERFORM private.dp_json_campos_check(p_dados, ARRAY[
    'cargo_id','unidade_id','salario_base','vigencia_inicio','vigencia_fim',
    'sindicato_patronal_id','observacao']);

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.dp_cargo_salarios WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF v_row.removido_em IS NOT NULL THEN RAISE EXCEPTION 'REM_REGISTRO_EXCLUIDO'; END IF;
    v_company := v_row.company_id;
    v_cargo := coalesce((p_dados->>'cargo_id')::uuid, v_row.cargo_id);
  ELSE
    v_cargo := (p_dados->>'cargo_id')::uuid;
    IF v_cargo IS NULL THEN RAISE EXCEPTION 'REM_CARGO_INVALIDO'; END IF;
    SELECT company_id INTO v_company FROM public.dp_cargos
     WHERE id = v_cargo AND removido_em IS NULL;
    IF v_company IS NULL THEN RAISE EXCEPTION 'REM_CARGO_INVALIDO'; END IF;
  END IF;

  PERFORM private.dp_remuneracao_admin(v_company);
  v_unidade := CASE WHEN p_dados ? 'unidade_id' THEN (p_dados->>'unidade_id')::uuid ELSE v_row.unidade_id END;
  v_sind := CASE WHEN p_dados ? 'sindicato_patronal_id' THEN (p_dados->>'sindicato_patronal_id')::uuid ELSE v_row.sindicato_patronal_id END;
  PERFORM private.dp_remuneracao_escopo_check(v_company, v_unidade, v_cargo, v_sind);
  IF v_unidade IS NULL AND v_sind IS NULL THEN RAISE EXCEPTION 'REM_PISO_ESCOPO_OBRIGATORIO'; END IF;

  v_inicio := coalesce((p_dados->>'vigencia_inicio')::date, v_row.vigencia_inicio, CURRENT_DATE);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'dp_piso:' || v_company::text || ':' || v_cargo::text || ':' ||
    coalesce(v_unidade::text, 'sind') || ':' || coalesce(v_sind::text, '-'), 0));

  IF v_id IS NULL THEN
    -- Encontra ou sucede o piso em aberto do mesmo escopo.
    SELECT id, vigencia_inicio, salario_base INTO v_aberta
      FROM public.dp_cargo_salarios
     WHERE company_id = v_company AND cargo_id = v_cargo AND removido_em IS NULL
       AND vigencia_fim IS NULL
       AND ((v_unidade IS NOT NULL AND unidade_id = v_unidade)
            OR (v_unidade IS NULL AND unidade_id IS NULL AND sindicato_patronal_id = v_sind))
     ORDER BY vigencia_inicio DESC LIMIT 1;

    IF v_aberta.id IS NOT NULL AND v_aberta.vigencia_inicio >= v_inicio THEN
      v_id := v_aberta.id;
      SELECT * INTO v_row FROM public.dp_cargo_salarios WHERE id = v_id FOR UPDATE;
    ELSIF v_aberta.id IS NOT NULL THEN
      IF (p_dados->>'salario_base')::numeric < v_aberta.salario_base
         AND coalesce(btrim(p_justificativa),'') = '' THEN
        RAISE EXCEPTION 'REM_PISO_REDUCAO_SEM_JUSTIFICATIVA';
      END IF;
      UPDATE public.dp_cargo_salarios SET vigencia_fim = v_inicio - 1 WHERE id = v_aberta.id;
    END IF;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.dp_cargo_salarios(company_id, cargo_id, salario_base, vigencia_inicio)
    VALUES (v_company, v_cargo, coalesce((p_dados->>'salario_base')::numeric, 0), v_inicio)
    RETURNING * INTO v_row;
  END IF;

  v_anterior := to_jsonb(v_row);
  v_row := jsonb_populate_record(v_row, p_dados);
  v_row.vigencia_inicio := v_inicio;
  v_row.cargo_id := v_cargo;
  v_row.unidade_id := v_unidade;
  v_row.sindicato_patronal_id := v_sind;

  IF v_row.salario_base IS NULL OR v_row.salario_base <= 0 THEN RAISE EXCEPTION 'REM_SALARIO_INVALIDO'; END IF;
  PERFORM private.dp_faixa_check(v_row.salario_base, 0, 1000000, 'REM_SALARIO_INVALIDO');
  IF v_row.vigencia_fim IS NOT NULL AND v_row.vigencia_fim < v_row.vigencia_inicio THEN
    RAISE EXCEPTION 'REM_PISO_VIGENCIA_INVALIDA';
  END IF;
  IF p_id IS NOT NULL
     AND v_row.salario_base < (v_anterior->>'salario_base')::numeric
     AND coalesce(btrim(p_justificativa),'') = '' THEN
    RAISE EXCEPTION 'REM_PISO_REDUCAO_SEM_JUSTIFICATIVA';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.dp_cargo_salarios s
     WHERE s.company_id = v_company AND s.cargo_id = v_cargo AND s.id <> v_row.id
       AND s.removido_em IS NULL
       AND ((v_unidade IS NOT NULL AND s.unidade_id = v_unidade)
            OR (v_unidade IS NULL AND s.unidade_id IS NULL AND s.sindicato_patronal_id = v_sind))
       AND daterange(s.vigencia_inicio, s.vigencia_fim, '[]')
           && daterange(v_row.vigencia_inicio, v_row.vigencia_fim, '[]')
  ) THEN RAISE EXCEPTION 'REM_PISO_VIGENCIA_SOBREPOSTA'; END IF;

  UPDATE public.dp_cargo_salarios SET
    cargo_id = v_row.cargo_id, unidade_id = v_row.unidade_id,
    sindicato_patronal_id = v_row.sindicato_patronal_id, salario_base = v_row.salario_base,
    vigencia_inicio = v_row.vigencia_inicio, vigencia_fim = v_row.vigencia_fim,
    observacao = v_row.observacao
   WHERE id = v_row.id;

  IF coalesce(btrim(p_justificativa),'') <> ''
     OR (v_anterior->>'salario_base')::numeric IS DISTINCT FROM v_row.salario_base THEN
    INSERT INTO public.dp_regras_historico(company_id, tabela, registro_id, usuario_id,
      justificativa, valor_antigo, valor_novo)
    VALUES (v_company, 'dp_cargo_salarios', v_row.id, auth.uid(),
      nullif(btrim(coalesce(p_justificativa,'')), ''), v_anterior, to_jsonb(v_row));
  END IF;
  RETURN v_row.id;
END $$;

-- 5) Benefício do catálogo --------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_beneficio_salvar(p_dados jsonb, p_company_id uuid, p_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.dp_beneficios; v_id uuid := p_id; v_nome text;
BEGIN
  PERFORM private.dp_remuneracao_admin(p_company_id);
  PERFORM private.dp_json_campos_check(p_dados, ARRAY[
    'nome','tipo','valor_padrao','desconto_percentual','folha_tipo','descricao','ativo',
    'periodicidade','dias_base','desconto_tipo','desconto_valor_fixo','dia_pagamento',
    'dias_antecedencia_corte','desconta_falta','desconta_folga_extra','desconta_atestado',
    'desconta_ferias','unidade_id','cargo_id']);

  IF v_id IS NULL THEN
    v_nome := upper(btrim(coalesce(p_dados->>'nome','')));
    IF v_nome = '' THEN RAISE EXCEPTION 'REM_BENEFICIO_NOME_OBRIGATORIO'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('dp_beneficio:' || p_company_id::text || ':' || v_nome
      || ':' || coalesce(p_dados->>'unidade_id','-') || ':' || coalesce(p_dados->>'cargo_id','-'), 0));
    SELECT id INTO v_id FROM public.dp_beneficios
     WHERE company_id = p_company_id AND removido_em IS NULL AND upper(btrim(nome)) = v_nome
       AND unidade_id IS NOT DISTINCT FROM (p_dados->>'unidade_id')::uuid
       AND cargo_id IS NOT DISTINCT FROM (p_dados->>'cargo_id')::uuid
     LIMIT 1;
    IF v_id IS NULL THEN
      INSERT INTO public.dp_beneficios(company_id, nome) VALUES (p_company_id, v_nome) RETURNING * INTO v_row;
    END IF;
  END IF;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.dp_beneficios WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF v_row.company_id <> p_company_id THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    IF v_row.removido_em IS NOT NULL THEN RAISE EXCEPTION 'REM_REGISTRO_EXCLUIDO'; END IF;
  END IF;

  v_row := jsonb_populate_record(v_row, p_dados);
  v_row.nome := upper(btrim(coalesce(v_row.nome,'')));
  IF v_row.nome = '' THEN RAISE EXCEPTION 'REM_BENEFICIO_NOME_OBRIGATORIO'; END IF;
  PERFORM private.dp_remuneracao_escopo_check(p_company_id, v_row.unidade_id, v_row.cargo_id, NULL);
  PERFORM private.dp_faixa_check(v_row.valor_padrao, 0, 1000000, 'REM_VALOR_INVALIDO');
  PERFORM private.dp_faixa_check(v_row.desconto_valor_fixo, 0, 1000000, 'REM_VALOR_INVALIDO');
  PERFORM private.dp_faixa_check(v_row.desconto_percentual, 0, 100, 'REM_PERCENTUAL_INVALIDO');
  PERFORM private.dp_faixa_check(v_row.dias_base, 0, 31, 'REM_DIAS_INVALIDOS');
  PERFORM private.dp_faixa_check(v_row.dia_pagamento, 1, 31, 'REM_DIA_PAGAMENTO_INVALIDO');
  PERFORM private.dp_faixa_check(v_row.dias_antecedencia_corte, 0, 31, 'REM_DIAS_INVALIDOS');

  UPDATE public.dp_beneficios SET
    nome = v_row.nome, tipo = v_row.tipo, valor_padrao = v_row.valor_padrao,
    desconto_percentual = v_row.desconto_percentual, folha_tipo = v_row.folha_tipo,
    descricao = v_row.descricao, ativo = v_row.ativo, periodicidade = v_row.periodicidade,
    dias_base = v_row.dias_base, desconto_tipo = v_row.desconto_tipo,
    desconto_valor_fixo = v_row.desconto_valor_fixo, dia_pagamento = v_row.dia_pagamento,
    dias_antecedencia_corte = v_row.dias_antecedencia_corte, desconta_falta = v_row.desconta_falta,
    desconta_folga_extra = v_row.desconta_folga_extra, desconta_atestado = v_row.desconta_atestado,
    desconta_ferias = v_row.desconta_ferias, unidade_id = v_row.unidade_id, cargo_id = v_row.cargo_id
   WHERE id = v_row.id;
  RETURN v_row.id;
END $$;

-- 6) Padrão de benefícios por escopo ----------------------------------
CREATE OR REPLACE FUNCTION public.dp_beneficio_padrao_salvar(
  p_company_id uuid, p_payload jsonb, p_unidade_id uuid DEFAULT NULL,
  p_cargo_id uuid DEFAULT NULL, p_limpar_especificos boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM private.dp_remuneracao_admin(p_company_id);
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'REM_DADOS_INVALIDOS'; END IF;
  PERFORM private.dp_remuneracao_escopo_check(p_company_id, p_unidade_id, p_cargo_id, NULL);
  PERFORM pg_advisory_xact_lock(hashtextextended('dp_beneficio_padrao:' || p_company_id::text || ':' ||
    coalesce(p_unidade_id::text,'-') || ':' || coalesce(p_cargo_id::text,'-'), 0));

  SELECT id INTO v_id FROM public.dp_beneficios_padroes
   WHERE company_id = p_company_id AND removido_em IS NULL
     AND unidade_id IS NOT DISTINCT FROM p_unidade_id
     AND cargo_id IS NOT DISTINCT FROM p_cargo_id
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.dp_beneficios_padroes(company_id, unidade_id, cargo_id, payload, created_by)
    VALUES (p_company_id, p_unidade_id, p_cargo_id, p_payload, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.dp_beneficios_padroes SET payload = p_payload WHERE id = v_id;
  END IF;

  IF p_limpar_especificos THEN
    UPDATE public.dp_beneficios_padroes
       SET removido_em = now(), removido_por = auth.uid(),
           removido_motivo = 'Substituído por padrão de escopo mais amplo'
     WHERE company_id = p_company_id AND removido_em IS NULL AND id <> v_id
       AND (
         (p_unidade_id IS NOT NULL AND unidade_id = p_unidade_id AND cargo_id IS NOT NULL)
         OR (p_unidade_id IS NULL AND (unidade_id IS NOT NULL OR cargo_id IS NOT NULL))
       );
  END IF;
  RETURN v_id;
END $$;

-- 7) Adicional por tempo de serviço -----------------------------------
CREATE OR REPLACE FUNCTION public.dp_adicional_tempo_servico_salvar(
  p_dados jsonb, p_company_id uuid, p_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.dp_adicionais_tempo_servico; v_id uuid := p_id;
BEGIN
  PERFORM private.dp_remuneracao_admin(p_company_id);
  PERFORM private.dp_json_campos_check(p_dados, ARRAY[
    'nome','escopo','sindicato_id','unidade_id','cargo_id','ciclo_meses','percentual_por_ciclo',
    'base','max_ciclos','acumula','vigencia_inicio','vigencia_fim','ativo','observacao']);

  PERFORM pg_advisory_xact_lock(hashtextextended('dp_adic_ts:' || p_company_id::text || ':' ||
    coalesce(p_dados->>'escopo','empresa') || ':' || coalesce(p_dados->>'unidade_id','-') || ':' ||
    coalesce(p_dados->>'cargo_id','-') || ':' || coalesce(p_dados->>'sindicato_id','-') || ':' ||
    coalesce(p_dados->>'vigencia_inicio','-'), 0));

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.dp_adicionais_tempo_servico
     WHERE company_id = p_company_id AND removido_em IS NULL
       AND escopo = coalesce(p_dados->>'escopo','empresa')
       AND unidade_id IS NOT DISTINCT FROM (p_dados->>'unidade_id')::uuid
       AND cargo_id IS NOT DISTINCT FROM (p_dados->>'cargo_id')::uuid
       AND sindicato_id IS NOT DISTINCT FROM (p_dados->>'sindicato_id')::uuid
       AND vigencia_inicio = coalesce((p_dados->>'vigencia_inicio')::date, CURRENT_DATE)
     LIMIT 1;
    IF v_id IS NULL THEN
      INSERT INTO public.dp_adicionais_tempo_servico(company_id) VALUES (p_company_id) RETURNING * INTO v_row;
    END IF;
  END IF;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.dp_adicionais_tempo_servico WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF v_row.company_id <> p_company_id THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    IF v_row.removido_em IS NOT NULL THEN RAISE EXCEPTION 'REM_REGISTRO_EXCLUIDO'; END IF;
  END IF;

  v_row := jsonb_populate_record(v_row, p_dados);
  v_row.nome := nullif(btrim(coalesce(v_row.nome,'')),'');
  IF v_row.nome IS NULL THEN v_row.nome := 'Adicional por tempo de serviço'; END IF;
  IF v_row.escopo NOT IN ('empresa','unidade','cargo','sindicato') THEN RAISE EXCEPTION 'REM_ESCOPO_INVALIDO'; END IF;
  PERFORM private.dp_remuneracao_escopo_check(p_company_id, v_row.unidade_id, v_row.cargo_id, v_row.sindicato_id);
  IF v_row.escopo = 'unidade' AND v_row.unidade_id IS NULL THEN RAISE EXCEPTION 'REM_ESCOPO_INVALIDO'; END IF;
  IF v_row.escopo = 'cargo' AND v_row.cargo_id IS NULL THEN RAISE EXCEPTION 'REM_ESCOPO_INVALIDO'; END IF;
  IF v_row.escopo = 'sindicato' AND v_row.sindicato_id IS NULL THEN RAISE EXCEPTION 'REM_ESCOPO_INVALIDO'; END IF;
  PERFORM private.dp_faixa_check(v_row.percentual_por_ciclo, 0, 100, 'REM_PERCENTUAL_INVALIDO');
  PERFORM private.dp_faixa_check(v_row.ciclo_meses, 1, 600, 'REM_CICLO_INVALIDO');
  PERFORM private.dp_faixa_check(v_row.max_ciclos, 0, 100, 'REM_CICLO_INVALIDO');
  IF v_row.base NOT IN ('salario_base','salario_total') THEN RAISE EXCEPTION 'REM_BASE_INVALIDA'; END IF;
  IF v_row.vigencia_fim IS NOT NULL AND v_row.vigencia_fim < v_row.vigencia_inicio THEN
    RAISE EXCEPTION 'REM_VIGENCIA_INVALIDA';
  END IF;
  IF v_row.ativo AND EXISTS (
    SELECT 1 FROM public.dp_adicionais_tempo_servico a
     WHERE a.company_id = p_company_id AND a.id <> v_row.id AND a.removido_em IS NULL AND a.ativo
       AND a.escopo = v_row.escopo
       AND a.unidade_id IS NOT DISTINCT FROM v_row.unidade_id
       AND a.cargo_id IS NOT DISTINCT FROM v_row.cargo_id
       AND a.sindicato_id IS NOT DISTINCT FROM v_row.sindicato_id
       AND daterange(a.vigencia_inicio, a.vigencia_fim, '[]')
           && daterange(v_row.vigencia_inicio, v_row.vigencia_fim, '[]')
  ) THEN RAISE EXCEPTION 'REM_ADICIONAL_VIGENCIA_SOBREPOSTA'; END IF;

  UPDATE public.dp_adicionais_tempo_servico SET
    nome = v_row.nome, escopo = v_row.escopo, sindicato_id = v_row.sindicato_id,
    unidade_id = v_row.unidade_id, cargo_id = v_row.cargo_id, ciclo_meses = v_row.ciclo_meses,
    percentual_por_ciclo = v_row.percentual_por_ciclo, base = v_row.base,
    max_ciclos = v_row.max_ciclos, acumula = v_row.acumula, vigencia_inicio = v_row.vigencia_inicio,
    vigencia_fim = v_row.vigencia_fim, ativo = v_row.ativo, observacao = v_row.observacao
   WHERE id = v_row.id;
  RETURN v_row.id;
END $$;

-- 8) Benefício do colaborador -----------------------------------------
CREATE OR REPLACE FUNCTION public.dp_colaborador_beneficio_definir(p_dados jsonb, p_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.dp_colaborador_beneficios; v_id uuid := p_id; v_company uuid;
        v_colab uuid; v_beneficio uuid; v_inicio date;
BEGIN
  PERFORM private.dp_json_campos_check(p_dados, ARRAY[
    'colaborador_id','beneficio_id','valor','desconto_valor','data_inicio','data_fim','ativo',
    'observacao','desconto_tipo','desconto_percentual','dispensado_pelo_colaborador','dispensa_motivo']);

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.dp_colaborador_beneficios WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF v_row.removido_em IS NOT NULL THEN RAISE EXCEPTION 'REM_REGISTRO_EXCLUIDO'; END IF;
    v_company := v_row.company_id;
    v_colab := coalesce((p_dados->>'colaborador_id')::uuid, v_row.colaborador_id);
    v_beneficio := coalesce((p_dados->>'beneficio_id')::uuid, v_row.beneficio_id);
  ELSE
    v_colab := (p_dados->>'colaborador_id')::uuid;
    v_beneficio := (p_dados->>'beneficio_id')::uuid;
    SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = v_colab;
    IF v_company IS NULL THEN RAISE EXCEPTION 'REM_COLABORADOR_INVALIDO'; END IF;
  END IF;

  PERFORM private.dp_remuneracao_admin(v_company);
  IF NOT EXISTS (SELECT 1 FROM public.dp_colaboradores
                  WHERE id = v_colab AND company_id = v_company) THEN
    RAISE EXCEPTION 'REM_COLABORADOR_INVALIDO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dp_beneficios
                  WHERE id = v_beneficio AND company_id = v_company AND removido_em IS NULL) THEN
    RAISE EXCEPTION 'REM_BENEFICIO_INVALIDO';
  END IF;

  v_inicio := coalesce((p_dados->>'data_inicio')::date, v_row.data_inicio, CURRENT_DATE);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'dp_colab_beneficio:' || v_colab::text || ':' || v_beneficio::text, 0));

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.dp_colaborador_beneficios
     WHERE colaborador_id = v_colab AND beneficio_id = v_beneficio AND removido_em IS NULL
       AND data_inicio = v_inicio
     LIMIT 1;
    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM public.dp_colaborador_beneficios
       WHERE colaborador_id = v_colab AND beneficio_id = v_beneficio AND removido_em IS NULL
         AND data_fim IS NULL
       ORDER BY data_inicio DESC LIMIT 1;
    END IF;
    IF v_id IS NULL THEN
      INSERT INTO public.dp_colaborador_beneficios(company_id, colaborador_id, beneficio_id, data_inicio)
      VALUES (v_company, v_colab, v_beneficio, v_inicio) RETURNING * INTO v_row;
    ELSE
      SELECT * INTO v_row FROM public.dp_colaborador_beneficios WHERE id = v_id FOR UPDATE;
    END IF;
  END IF;

  v_row := jsonb_populate_record(v_row, p_dados);
  v_row.colaborador_id := v_colab;
  v_row.beneficio_id := v_beneficio;
  v_row.data_inicio := v_inicio;
  PERFORM private.dp_faixa_check(v_row.valor, 0, 1000000, 'REM_VALOR_INVALIDO');
  PERFORM private.dp_faixa_check(v_row.desconto_valor, 0, 1000000, 'REM_VALOR_INVALIDO');
  PERFORM private.dp_faixa_check(v_row.desconto_percentual, 0, 100, 'REM_PERCENTUAL_INVALIDO');
  IF v_row.data_fim IS NOT NULL AND v_row.data_fim < v_row.data_inicio THEN
    RAISE EXCEPTION 'REM_VIGENCIA_INVALIDA';
  END IF;

  UPDATE public.dp_colaborador_beneficios SET
    colaborador_id = v_row.colaborador_id, beneficio_id = v_row.beneficio_id, valor = v_row.valor,
    desconto_valor = v_row.desconto_valor, data_inicio = v_row.data_inicio, data_fim = v_row.data_fim,
    ativo = v_row.ativo, observacao = v_row.observacao, desconto_tipo = v_row.desconto_tipo,
    desconto_percentual = v_row.desconto_percentual,
    dispensado_pelo_colaborador = v_row.dispensado_pelo_colaborador,
    dispensa_motivo = v_row.dispensa_motivo
   WHERE id = v_row.id;
  RETURN v_row.id;
END $$;

CREATE OR REPLACE FUNCTION public.dp_colaborador_beneficios_definir_lote(p_itens jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item jsonb; v_total integer := 0;
BEGIN
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN RAISE EXCEPTION 'REM_DADOS_INVALIDOS'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    PERFORM public.dp_colaborador_beneficio_definir(v_item - 'id', nullif(v_item->>'id','')::uuid);
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END $$;

-- 9) Exclusão lógica dos cadastros de remuneração ---------------------
CREATE OR REPLACE FUNCTION public.dp_cadastro_remuneracao_excluir(
  p_tabela text, p_id uuid, p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_sql text;
BEGIN
  IF p_tabela NOT IN ('dp_cargos','dp_cargo_salarios','dp_beneficios','dp_beneficios_padroes',
                      'dp_adicionais_tempo_servico','dp_colaborador_beneficios') THEN
    RAISE EXCEPTION 'REM_TABELA_NAO_PERMITIDA';
  END IF;
  EXECUTE format('SELECT company_id FROM public.%I WHERE id = $1 AND removido_em IS NULL', p_tabela)
    INTO v_company USING p_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM private.dp_remuneracao_admin(v_company);

  IF p_tabela = 'dp_cargos' THEN
    IF EXISTS (SELECT 1 FROM public.dp_colaboradores WHERE cargo_id = p_id) THEN
      RAISE EXCEPTION 'REM_CARGO_EM_USO';
    END IF;
  ELSIF p_tabela = 'dp_beneficios' THEN
    IF EXISTS (SELECT 1 FROM public.dp_colaborador_beneficios
                WHERE beneficio_id = p_id AND removido_em IS NULL AND ativo) THEN
      RAISE EXCEPTION 'REM_BENEFICIO_EM_USO';
    END IF;
  END IF;

  v_sql := format('UPDATE public.%I SET removido_em = now(), removido_por = $1, removido_motivo = $2 WHERE id = $3', p_tabela);
  EXECUTE v_sql USING auth.uid(), nullif(btrim(coalesce(p_motivo,'')),''), p_id;
END $$;

-- 10) Permissões das rotinas -----------------------------------------
REVOKE ALL ON FUNCTION public.dp_cargo_salvar(jsonb, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_cargo_piso_definir(jsonb, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_beneficio_salvar(jsonb, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_beneficio_padrao_salvar(uuid, jsonb, uuid, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_adicional_tempo_servico_salvar(jsonb, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_colaborador_beneficio_definir(jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_colaborador_beneficios_definir_lote(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_cadastro_remuneracao_excluir(text, uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.dp_cargo_salvar(jsonb, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_cargo_piso_definir(jsonb, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_beneficio_salvar(jsonb, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_beneficio_padrao_salvar(uuid, jsonb, uuid, uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_adicional_tempo_servico_salvar(jsonb, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_beneficio_definir(jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_beneficios_definir_lote(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_cadastro_remuneracao_excluir(text, uuid, text) TO authenticated, service_role;

-- 11) Gravação direta fechada ----------------------------------------
DROP POLICY IF EXISTS dp_cargos_write_admin ON public.dp_cargos;
CREATE POLICY dp_cargos_read_admin ON public.dp_cargos FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));
DROP POLICY IF EXISTS dp_cargo_salarios_write_admin ON public.dp_cargo_salarios;
DROP POLICY IF EXISTS dp_beneficios_admin_write ON public.dp_beneficios;
CREATE POLICY dp_beneficios_admin_read ON public.dp_beneficios FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));
DROP POLICY IF EXISTS dp_beneficios_padroes_write_admin ON public.dp_beneficios_padroes;
DROP POLICY IF EXISTS dp_adic_ts_write_admin ON public.dp_adicionais_tempo_servico;
DROP POLICY IF EXISTS dp_colaborador_beneficios_admin_write ON public.dp_colaborador_beneficios;
CREATE POLICY dp_colaborador_beneficios_admin_read ON public.dp_colaborador_beneficios FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

REVOKE INSERT, UPDATE, DELETE ON public.dp_cargos FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dp_cargo_salarios FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dp_beneficios FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dp_beneficios_padroes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dp_adicionais_tempo_servico FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dp_colaborador_beneficios FROM authenticated;

REVOKE ALL ON public.dp_cargos FROM anon;
REVOKE ALL ON public.dp_cargo_salarios FROM anon;
REVOKE ALL ON public.dp_beneficios FROM anon;
REVOKE ALL ON public.dp_beneficios_padroes FROM anon;
REVOKE ALL ON public.dp_adicionais_tempo_servico FROM anon;
REVOKE ALL ON public.dp_colaborador_beneficios FROM anon;

GRANT ALL ON public.dp_cargos TO service_role;
GRANT ALL ON public.dp_cargo_salarios TO service_role;
GRANT ALL ON public.dp_beneficios TO service_role;
GRANT ALL ON public.dp_beneficios_padroes TO service_role;
GRANT ALL ON public.dp_adicionais_tempo_servico TO service_role;
GRANT ALL ON public.dp_colaborador_beneficios TO service_role;