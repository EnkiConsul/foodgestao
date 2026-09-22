-- ============================================================
-- FASE 10 — Regras que governam as validações de Pessoas 360°
-- ============================================================

-- 1) Exclusão lógica nas regras de bloqueio, férias e cobertura ---------------
ALTER TABLE public.dp_bloqueio_regras
  ADD COLUMN IF NOT EXISTS removido_em timestamptz,
  ADD COLUMN IF NOT EXISTS removido_por uuid,
  ADD COLUMN IF NOT EXISTS removido_motivo text;
ALTER TABLE public.dp_ferias_regras
  ADD COLUMN IF NOT EXISTS removido_em timestamptz,
  ADD COLUMN IF NOT EXISTS removido_por uuid,
  ADD COLUMN IF NOT EXISTS removido_motivo text;
ALTER TABLE public.dp_ferias_bloqueios
  ADD COLUMN IF NOT EXISTS removido_em timestamptz,
  ADD COLUMN IF NOT EXISTS removido_por uuid,
  ADD COLUMN IF NOT EXISTS removido_motivo text;
ALTER TABLE public.dp_cobertura_minima
  ADD COLUMN IF NOT EXISTS removido_em timestamptz,
  ADD COLUMN IF NOT EXISTS removido_por uuid,
  ADD COLUMN IF NOT EXISTS removido_motivo text;

CREATE INDEX IF NOT EXISTS dp_bloqueio_regras_ativas_idx
  ON public.dp_bloqueio_regras (company_id) WHERE removido_em IS NULL;
CREATE INDEX IF NOT EXISTS dp_ferias_regras_ativas_idx
  ON public.dp_ferias_regras (company_id) WHERE removido_em IS NULL;
CREATE INDEX IF NOT EXISTS dp_ferias_bloqueios_ativos_idx
  ON public.dp_ferias_bloqueios (company_id) WHERE removido_em IS NULL;
CREATE INDEX IF NOT EXISTS dp_cobertura_minima_ativas_idx
  ON public.dp_cobertura_minima (company_id) WHERE removido_em IS NULL;

-- 2) Auxiliares internos -----------------------------------------------------
CREATE OR REPLACE FUNCTION private.dp_regras_admin(p_company_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user IN ('service_role', 'postgres', 'supabase_admin') THEN RETURN; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_company_id IS NULL THEN RAISE EXCEPTION 'REGRA_EMPRESA_OBRIGATORIA'; END IF;
  IF private.is_company_admin_or_owner(auth.uid(), p_company_id) THEN RETURN; END IF;
  IF public.is_super_admin(auth.uid()) THEN RETURN; END IF;
  RAISE EXCEPTION 'FORBIDDEN';
END $$;

CREATE OR REPLACE FUNCTION private.dp_regras_membro(p_company_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user IN ('service_role', 'postgres', 'supabase_admin') THEN RETURN; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_company_id IS NULL THEN RAISE EXCEPTION 'REGRA_EMPRESA_OBRIGATORIA'; END IF;
  IF private.is_company_member(auth.uid(), p_company_id) THEN RETURN; END IF;
  IF public.is_super_admin(auth.uid()) THEN RETURN; END IF;
  RAISE EXCEPTION 'FORBIDDEN';
END $$;

CREATE OR REPLACE FUNCTION private.dp_regras_fila(p_chave text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(p_chave, ''), 0));
END $$;

-- Lista fechada de campos: qualquer campo fora da lista é recusado.
CREATE OR REPLACE FUNCTION private.dp_regras_campos(
  p_dados jsonb,
  p_permitidos text[],
  p_ignorar text[] DEFAULT ARRAY['id','company_id','created_at','updated_at','criado_por','autor_id','removido_em','removido_por','removido_motivo']
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_out jsonb := '{}'::jsonb; k text;
BEGIN
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN RETURN v_out; END IF;
  FOR k IN SELECT key FROM jsonb_each(p_dados) LOOP
    IF k = ANY (p_permitidos) THEN
      v_out := v_out || jsonb_build_object(k, p_dados -> k);
    ELSIF NOT (k = ANY (p_ignorar)) THEN
      RAISE EXCEPTION 'REGRA_CAMPO_INVALIDO: %', k;
    END IF;
  END LOOP;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION private.dp_regras_faixa(
  p_nome text, p_valor numeric, p_min numeric, p_max numeric
) RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_valor IS NULL THEN RETURN; END IF;
  IF p_valor < p_min OR p_valor > p_max THEN
    RAISE EXCEPTION 'REGRA_FORA_DA_FAIXA: %', p_nome;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.dp_regras_numero(p_dados jsonb, p_chave text)
RETURNS numeric LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_dados ? p_chave AND jsonb_typeof(p_dados -> p_chave) = 'number'
      THEN (p_dados ->> p_chave)::numeric
    WHEN p_dados ? p_chave AND jsonb_typeof(p_dados -> p_chave) = 'string'
         AND (p_dados ->> p_chave) ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (p_dados ->> p_chave)::numeric
    ELSE NULL
  END
$$;

-- Escopo: unidade, cargo, setor, turno, colaborador e pessoa de apoio da mesma empresa.
CREATE OR REPLACE FUNCTION private.dp_regras_escopo(
  p_company_id uuid,
  p_unidade_id uuid DEFAULT NULL,
  p_cargo_id uuid DEFAULT NULL,
  p_setor_id uuid DEFAULT NULL,
  p_turno_id uuid DEFAULT NULL,
  p_colaborador_id uuid DEFAULT NULL,
  p_pessoa_apoio_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_unidade_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_unidades WHERE id = p_unidade_id AND company_id = p_company_id
  ) THEN RAISE EXCEPTION 'REGRA_ESCOPO_INVALIDO: unidade'; END IF;

  IF p_cargo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_cargos WHERE id = p_cargo_id AND company_id = p_company_id
  ) THEN RAISE EXCEPTION 'REGRA_ESCOPO_INVALIDO: cargo'; END IF;

  IF p_setor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_setores WHERE id = p_setor_id AND company_id = p_company_id
  ) THEN RAISE EXCEPTION 'REGRA_ESCOPO_INVALIDO: setor'; END IF;

  IF p_turno_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_turnos WHERE id = p_turno_id AND company_id = p_company_id
  ) THEN RAISE EXCEPTION 'REGRA_ESCOPO_INVALIDO: turno'; END IF;

  IF p_colaborador_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_colaboradores WHERE id = p_colaborador_id AND company_id = p_company_id
  ) THEN RAISE EXCEPTION 'REGRA_ESCOPO_INVALIDO: colaborador'; END IF;

  IF p_pessoa_apoio_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_pessoas_apoio WHERE id = p_pessoa_apoio_id AND company_id = p_company_id
  ) THEN RAISE EXCEPTION 'REGRA_ESCOPO_INVALIDO: pessoa'; END IF;
END $$;

CREATE OR REPLACE FUNCTION private.dp_regras_hist(
  p_company_id uuid, p_tabela text, p_registro_id uuid,
  p_antigo jsonb, p_novo jsonb,
  p_justificativa text DEFAULT NULL, p_ciencia boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.dp_regras_historico (
    company_id, usuario_id, tabela, registro_id, valor_antigo, valor_novo,
    justificativa, ciencia_confirmada
  ) VALUES (
    p_company_id, auth.uid(), p_tabela, p_registro_id, p_antigo, p_novo,
    nullif(btrim(coalesce(p_justificativa, '')), ''), coalesce(p_ciencia, false)
  );
END $$;

CREATE OR REPLACE FUNCTION private.dp_regras_inserir(p_tabela regclass, p_valores jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cols text; v_id uuid;
BEGIN
  SELECT string_agg(quote_ident(key), ', ') INTO v_cols FROM jsonb_each(p_valores);
  IF v_cols IS NULL THEN RAISE EXCEPTION 'REGRA_SEM_DADOS'; END IF;
  EXECUTE format(
    'INSERT INTO %1$s (%2$s) SELECT %2$s FROM jsonb_populate_record(null::%1$s, $1) n RETURNING id',
    p_tabela, v_cols
  ) INTO v_id USING p_valores;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION private.dp_regras_atualizar(
  p_tabela regclass, p_id uuid, p_patch jsonb, p_touch boolean DEFAULT true
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sets text;
BEGIN
  SELECT string_agg(format('%1$I = n.%1$I', key), ', ') INTO v_sets FROM jsonb_each(p_patch);
  IF v_sets IS NULL THEN RETURN; END IF;
  EXECUTE format(
    'UPDATE %1$s t SET %2$s%3$s FROM jsonb_populate_record(null::%1$s, $1) n WHERE t.id = $2',
    p_tabela, v_sets, CASE WHEN p_touch THEN ', updated_at = now()' ELSE '' END
  ) USING p_patch, p_id;
END $$;

REVOKE ALL ON FUNCTION private.dp_regras_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_regras_membro(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_regras_fila(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_regras_campos(jsonb, text[], text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_regras_faixa(text, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_regras_numero(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_regras_escopo(uuid, uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_regras_hist(uuid, text, uuid, jsonb, jsonb, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_regras_inserir(regclass, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_regras_atualizar(regclass, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;

-- 3) Configuração do DP ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_config_dp_salvar(
  p_company_id uuid,
  p_unidade_id uuid,
  p_patch jsonb,
  p_justificativa text DEFAULT NULL,
  p_ciencia boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_patch jsonb;
  v_row public.dp_config_dp;
  v_base public.dp_config_dp;
  v_antigo jsonb;
  v_rotulo text;
  v_permitidos text[] := ARRAY[
    'setor_comercio','periodicidade_domingo','periodicidade_domingo_mulher','folgas_fds_por_mes',
    'politica_sabado','politica_feriado','regra_dsr','exige_validacao_menor','tipo_descanso_domingo',
    'negociacao_id','modo_domingo','dias_descanso_negociados','modo_frequencia_domingo','domingos_por_mes',
    'modo_frequencia_domingo_mulher','domingos_por_mes_mulher','turno_categoria_labels',
    'salario_familia_cota','salario_familia_teto','salario_familia_vigencia','salario_familia_confirmado_em',
    'salario_familia_ativo','adicional_tempo_servico_ativo','adicional_tempo_servico_modo','assiduidade_ativa',
    'va_ativo','va_dia_pagamento','va_dias_corte','va_desconta_falta','va_desconta_folga_extra',
    'va_desconta_atestado','va_desconta_ferias',
    'vt_ativo','vt_dia_pagamento','vt_dias_corte','vt_desconta_falta','vt_desconta_folga_extra',
    'vt_desconta_atestado','vt_desconta_ferias',
    'troca_folga_modo','troca_folga_escopo','considerar_indisponibilidade_cobertura',
    'folga_janela_ativa','folga_janela_abre_dia','folga_janela_fecha_dia','folga_autoatribuir',
    'ferias_aviso_antecedencia_dias','ferias_adiantamento_13','ferias_fracionamento_max',
    'ferias_fracao_min_dias','ferias_fracao_maior_dias','ferias_controle_inicio',
    'ferias_sinalizacao_ciclo_encerrado',
    'ocorrencia_prazo_retroativo_dias','ocorrencia_cobertura_aprovacao',
    'exigir_contracheque_mes_desligamento'
  ];
BEGIN
  PERFORM private.dp_regras_admin(p_company_id);
  PERFORM private.dp_regras_escopo(p_company_id, p_unidade_id);
  v_patch := private.dp_regras_campos(p_patch, v_permitidos);
  IF v_patch = '{}'::jsonb THEN RAISE EXCEPTION 'REGRA_SEM_DADOS'; END IF;

  -- Faixas (dias, percentuais e valores)
  PERFORM private.dp_regras_faixa('periodicidade_domingo', private.dp_regras_numero(v_patch,'periodicidade_domingo'), 1, 52);
  PERFORM private.dp_regras_faixa('periodicidade_domingo_mulher', private.dp_regras_numero(v_patch,'periodicidade_domingo_mulher'), 1, 52);
  PERFORM private.dp_regras_faixa('domingos_por_mes', private.dp_regras_numero(v_patch,'domingos_por_mes'), 0, 5);
  PERFORM private.dp_regras_faixa('domingos_por_mes_mulher', private.dp_regras_numero(v_patch,'domingos_por_mes_mulher'), 0, 5);
  PERFORM private.dp_regras_faixa('folgas_fds_por_mes', private.dp_regras_numero(v_patch,'folgas_fds_por_mes'), 0, 5);
  PERFORM private.dp_regras_faixa('folga_janela_abre_dia', private.dp_regras_numero(v_patch,'folga_janela_abre_dia'), 1, 28);
  PERFORM private.dp_regras_faixa('folga_janela_fecha_dia', private.dp_regras_numero(v_patch,'folga_janela_fecha_dia'), 1, 28);
  PERFORM private.dp_regras_faixa('ferias_aviso_antecedencia_dias', private.dp_regras_numero(v_patch,'ferias_aviso_antecedencia_dias'), 0, 365);
  PERFORM private.dp_regras_faixa('ferias_fracionamento_max', private.dp_regras_numero(v_patch,'ferias_fracionamento_max'), 1, 3);
  PERFORM private.dp_regras_faixa('ferias_fracao_min_dias', private.dp_regras_numero(v_patch,'ferias_fracao_min_dias'), 1, 30);
  PERFORM private.dp_regras_faixa('ferias_fracao_maior_dias', private.dp_regras_numero(v_patch,'ferias_fracao_maior_dias'), 1, 30);
  PERFORM private.dp_regras_faixa('ocorrencia_prazo_retroativo_dias', private.dp_regras_numero(v_patch,'ocorrencia_prazo_retroativo_dias'), 0, 90);
  PERFORM private.dp_regras_faixa('va_dia_pagamento', private.dp_regras_numero(v_patch,'va_dia_pagamento'), 1, 31);
  PERFORM private.dp_regras_faixa('vt_dia_pagamento', private.dp_regras_numero(v_patch,'vt_dia_pagamento'), 1, 31);
  PERFORM private.dp_regras_faixa('va_dias_corte', private.dp_regras_numero(v_patch,'va_dias_corte'), 0, 31);
  PERFORM private.dp_regras_faixa('vt_dias_corte', private.dp_regras_numero(v_patch,'vt_dias_corte'), 0, 31);
  PERFORM private.dp_regras_faixa('salario_familia_cota', private.dp_regras_numero(v_patch,'salario_familia_cota'), 0, 100000);
  PERFORM private.dp_regras_faixa('salario_familia_teto', private.dp_regras_numero(v_patch,'salario_familia_teto'), 0, 1000000);

  IF v_patch ? 'negociacao_id' AND nullif(v_patch->>'negociacao_id','') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.dp_sindicato_negociacoes n
       JOIN public.dp_sindicatos s ON s.id = n.sindicato_id
       WHERE n.id = (v_patch->>'negociacao_id')::uuid AND s.company_id = p_company_id
     ) THEN
    RAISE EXCEPTION 'REGRA_ESCOPO_INVALIDO: negociacao';
  END IF;

  PERFORM private.dp_regras_fila(format('config|%s|%s', p_company_id, coalesce(p_unidade_id::text,'empresa')));

  SELECT * INTO v_row FROM public.dp_config_dp
   WHERE company_id = p_company_id AND unidade_id IS NOT DISTINCT FROM p_unidade_id;

  IF v_row.id IS NULL THEN
    IF p_unidade_id IS NOT NULL THEN
      SELECT * INTO v_base FROM public.dp_config_dp
       WHERE company_id = p_company_id AND unidade_id IS NULL;
    END IF;
    IF v_base.id IS NOT NULL THEN
      v_base.id := gen_random_uuid();
      v_base.unidade_id := p_unidade_id;
      v_base.created_at := now();
      v_base.updated_at := now();
      INSERT INTO public.dp_config_dp VALUES (v_base.*) RETURNING * INTO v_row;
    ELSE
      INSERT INTO public.dp_config_dp (company_id, unidade_id)
      VALUES (p_company_id, p_unidade_id) RETURNING * INTO v_row;
    END IF;
  END IF;

  v_antigo := to_jsonb(v_row);
  PERFORM private.dp_regras_atualizar('public.dp_config_dp'::regclass, v_row.id, v_patch, true);
  SELECT * INTO v_row FROM public.dp_config_dp WHERE id = v_row.id;

  IF p_unidade_id IS NULL THEN
    v_rotulo := 'Regras de folgas — empresa';
  ELSE
    SELECT 'Regras de folgas — ' || coalesce(nome, 'unidade') INTO v_rotulo
      FROM public.dp_unidades WHERE id = p_unidade_id;
  END IF;

  PERFORM private.dp_regras_hist(
    p_company_id, v_rotulo, v_row.id,
    (SELECT jsonb_object_agg(key, v_antigo -> key) FROM jsonb_each(v_patch)),
    (SELECT jsonb_object_agg(key, to_jsonb(v_row) -> key) FROM jsonb_each(v_patch)),
    p_justificativa, p_ciencia
  );

  RETURN v_row.id;
END $$;

CREATE OR REPLACE FUNCTION public.dp_config_dp_excecao_excluir(p_company_id uuid, p_unidade_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.dp_config_dp;
BEGIN
  PERFORM private.dp_regras_admin(p_company_id);
  IF p_unidade_id IS NULL THEN RAISE EXCEPTION 'REGRA_UNIDADE_OBRIGATORIA'; END IF;
  PERFORM private.dp_regras_fila(format('config|%s|%s', p_company_id, p_unidade_id));

  SELECT * INTO v_row FROM public.dp_config_dp
   WHERE company_id = p_company_id AND unidade_id = p_unidade_id;
  IF v_row.id IS NULL THEN RETURN; END IF;

  DELETE FROM public.dp_config_dp WHERE id = v_row.id;
  PERFORM private.dp_regras_hist(
    p_company_id,
    'Regras de folgas — exceção removida',
    v_row.id, to_jsonb(v_row), NULL, NULL, false
  );
END $$;

-- 4) Regras de bloqueio de datas --------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_bloqueio_regra_salvar(
  p_company_id uuid, p_regra jsonb, p_unidades uuid[] DEFAULT '{}'::uuid[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_patch jsonb;
  v_id uuid := nullif(p_regra->>'id','')::uuid;
  v_antigo jsonb;
  v_uni uuid;
  v_permitidos text[] := ARRAY['nome','tipo','mes','dia','regra_json','ativo'];
BEGIN
  PERFORM private.dp_regras_admin(p_company_id);
  v_patch := private.dp_regras_campos(p_regra, v_permitidos, ARRAY['id','company_id','created_at','updated_at','criado_por','unidades']);

  IF nullif(btrim(coalesce(v_patch->>'nome','')),'') IS NULL THEN RAISE EXCEPTION 'REGRA_NOME_OBRIGATORIO'; END IF;
  IF length(btrim(v_patch->>'nome')) > 120 THEN RAISE EXCEPTION 'REGRA_NOME_INVALIDO'; END IF;
  v_patch := v_patch || jsonb_build_object('nome', btrim(v_patch->>'nome'));
  PERFORM private.dp_regras_faixa('mes', private.dp_regras_numero(v_patch,'mes'), 1, 12);
  PERFORM private.dp_regras_faixa('dia', private.dp_regras_numero(v_patch,'dia'), 1, 31);

  FOREACH v_uni IN ARRAY coalesce(p_unidades, '{}'::uuid[]) LOOP
    PERFORM private.dp_regras_escopo(p_company_id, v_uni);
  END LOOP;

  PERFORM private.dp_regras_fila(format('bloqueio_regra|%s', p_company_id));

  IF v_id IS NOT NULL THEN
    SELECT to_jsonb(r) INTO v_antigo FROM public.dp_bloqueio_regras r
     WHERE r.id = v_id AND r.company_id = p_company_id AND r.removido_em IS NULL;
    IF v_antigo IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    PERFORM private.dp_regras_atualizar('public.dp_bloqueio_regras'::regclass, v_id, v_patch, true);
  ELSE
    v_id := private.dp_regras_inserir(
      'public.dp_bloqueio_regras'::regclass,
      v_patch || jsonb_build_object('company_id', p_company_id, 'criado_por', auth.uid())
    );
  END IF;

  DELETE FROM public.dp_bloqueio_regra_unidades WHERE regra_id = v_id;
  IF array_length(coalesce(p_unidades,'{}'::uuid[]), 1) > 0 THEN
    INSERT INTO public.dp_bloqueio_regra_unidades (regra_id, unidade_id)
    SELECT v_id, u FROM unnest(p_unidades) u
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM private.dp_regras_hist(
    p_company_id, 'Regra de datas bloqueadas', v_id, v_antigo,
    (SELECT to_jsonb(r) FROM public.dp_bloqueio_regras r WHERE r.id = v_id), NULL, false
  );
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.dp_bloqueio_regra_excluir(p_id uuid, p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.dp_bloqueio_regras;
BEGIN
  SELECT * INTO v_row FROM public.dp_bloqueio_regras WHERE id = p_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM private.dp_regras_admin(v_row.company_id);
  IF v_row.removido_em IS NOT NULL THEN RETURN; END IF;

  UPDATE public.dp_bloqueio_regras
     SET ativo = false, removido_em = now(), removido_por = auth.uid(),
         removido_motivo = nullif(btrim(coalesce(p_motivo,'')),''), updated_at = now()
   WHERE id = p_id;

  PERFORM private.dp_regras_hist(
    v_row.company_id, 'Regra de datas bloqueadas — excluída', p_id,
    to_jsonb(v_row), NULL, p_motivo, false
  );
END $$;

-- 5) Datas bloqueadas e liberações ------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_data_bloqueada_salvar(
  p_company_id uuid,
  p_data date,
  p_motivo text,
  p_unidade_id uuid DEFAULT NULL,
  p_liberada boolean DEFAULT false,
  p_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_antigo jsonb;
BEGIN
  PERFORM private.dp_regras_admin(p_company_id);
  IF p_data IS NULL THEN RAISE EXCEPTION 'REGRA_DATA_OBRIGATORIA'; END IF;
  IF nullif(btrim(coalesce(p_motivo,'')),'') IS NULL THEN RAISE EXCEPTION 'REGRA_MOTIVO_OBRIGATORIO'; END IF;
  IF length(btrim(p_motivo)) > 300 THEN RAISE EXCEPTION 'REGRA_MOTIVO_INVALIDO'; END IF;
  PERFORM private.dp_regras_escopo(p_company_id, p_unidade_id);
  PERFORM private.dp_regras_fila(format('data_bloq|%s|%s|%s', p_company_id, coalesce(p_unidade_id::text,'-'), p_data));

  IF p_id IS NOT NULL THEN
    SELECT to_jsonb(d) INTO v_antigo FROM public.dp_datas_bloqueadas d
     WHERE d.id = p_id AND d.company_id = p_company_id;
    IF v_antigo IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    UPDATE public.dp_datas_bloqueadas
       SET data = p_data, motivo = btrim(p_motivo), unidade_id = p_unidade_id,
           liberada = coalesce(p_liberada,false), updated_at = now()
     WHERE id = p_id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.dp_datas_bloqueadas (company_id, data, motivo, unidade_id, liberada, criado_por)
    VALUES (p_company_id, p_data, btrim(p_motivo), p_unidade_id, coalesce(p_liberada,false), auth.uid())
    ON CONFLICT (company_id, unidade_id, data) DO UPDATE
      SET motivo = excluded.motivo, liberada = excluded.liberada, updated_at = now()
    RETURNING id INTO v_id;
  END IF;

  PERFORM private.dp_regras_hist(
    p_company_id,
    CASE WHEN coalesce(p_liberada,false) THEN 'Data liberada' ELSE 'Data bloqueada' END,
    v_id, v_antigo,
    (SELECT to_jsonb(d) FROM public.dp_datas_bloqueadas d WHERE d.id = v_id), NULL, false
  );
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.dp_datas_bloqueadas_definir_lote(
  p_company_id uuid,
  p_datas date[],
  p_unidades uuid[],
  p_motivo text,
  p_liberada boolean DEFAULT false
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uni uuid; v_data date; v_total integer := 0;
BEGIN
  PERFORM private.dp_regras_admin(p_company_id);
  IF coalesce(array_length(p_datas,1),0) = 0 THEN RAISE EXCEPTION 'REGRA_DATA_OBRIGATORIA'; END IF;
  IF array_length(p_datas,1) > 366 THEN RAISE EXCEPTION 'REGRA_LOTE_GRANDE'; END IF;
  IF coalesce(array_length(p_unidades,1),0) = 0 THEN RAISE EXCEPTION 'REGRA_UNIDADE_OBRIGATORIA'; END IF;
  IF nullif(btrim(coalesce(p_motivo,'')),'') IS NULL THEN RAISE EXCEPTION 'REGRA_MOTIVO_OBRIGATORIO'; END IF;

  FOREACH v_uni IN ARRAY p_unidades LOOP
    PERFORM private.dp_regras_escopo(p_company_id, v_uni);
  END LOOP;

  PERFORM private.dp_regras_fila(format('data_bloq_lote|%s', p_company_id));

  FOREACH v_uni IN ARRAY p_unidades LOOP
    FOREACH v_data IN ARRAY p_datas LOOP
      INSERT INTO public.dp_datas_bloqueadas (company_id, data, motivo, unidade_id, liberada, criado_por)
      VALUES (p_company_id, v_data, btrim(p_motivo), v_uni, coalesce(p_liberada,false), auth.uid())
      ON CONFLICT (company_id, unidade_id, data) DO UPDATE
        SET motivo = excluded.motivo, liberada = excluded.liberada, updated_at = now();
      v_total := v_total + 1;
    END LOOP;
  END LOOP;

  PERFORM private.dp_regras_hist(
    p_company_id, 'Datas bloqueadas em lote', NULL, NULL,
    jsonb_build_object('datas', to_jsonb(p_datas), 'unidades', to_jsonb(p_unidades),
                       'motivo', btrim(p_motivo), 'liberada', coalesce(p_liberada,false)),
    NULL, false
  );
  RETURN v_total;
END $$;

CREATE OR REPLACE FUNCTION public.dp_data_bloqueada_excluir(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.dp_datas_bloqueadas;
BEGIN
  SELECT * INTO v_row FROM public.dp_datas_bloqueadas WHERE id = p_id;
  IF v_row.id IS NULL THEN RETURN; END IF;
  PERFORM private.dp_regras_admin(v_row.company_id);
  DELETE FROM public.dp_datas_bloqueadas WHERE id = p_id;
  PERFORM private.dp_regras_hist(
    v_row.company_id, 'Data bloqueada — registro removido', p_id, to_jsonb(v_row), NULL, NULL, false
  );
END $$;

CREATE OR REPLACE FUNCTION public.dp_data_bloqueada_rebloquear(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.dp_datas_bloqueadas;
BEGIN
  SELECT * INTO v_row FROM public.dp_datas_bloqueadas WHERE id = p_id;
  IF v_row.id IS NULL THEN RETURN; END IF;
  PERFORM private.dp_regras_admin(v_row.company_id);

  IF v_row.regra_id IS NOT NULL THEN
    DELETE FROM public.dp_datas_bloqueadas WHERE id = p_id;
  ELSE
    UPDATE public.dp_datas_bloqueadas
       SET liberada = false, liberada_por_solicitacao = NULL, updated_at = now()
     WHERE id = p_id;
  END IF;

  PERFORM private.dp_regras_hist(
    v_row.company_id, 'Data bloqueada novamente', p_id, to_jsonb(v_row), NULL, NULL, false
  );
END $$;

-- 6) Limite de folgas do dia ------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_dia_config_definir(
  p_company_id uuid, p_data date, p_limite integer,
  p_unidade_id uuid DEFAULT NULL, p_observacao text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_antigo jsonb;
BEGIN
  PERFORM private.dp_regras_admin(p_company_id);
  IF p_data IS NULL THEN RAISE EXCEPTION 'REGRA_DATA_OBRIGATORIA'; END IF;
  PERFORM private.dp_regras_faixa('limite_folgas', p_limite, 0, 999);
  PERFORM private.dp_regras_escopo(p_company_id, p_unidade_id);
  PERFORM private.dp_regras_fila(format('dia_config|%s|%s|%s', p_company_id, coalesce(p_unidade_id::text,'-'), p_data));

  SELECT id, to_jsonb(d) INTO v_id, v_antigo FROM public.dp_dia_config d
   WHERE d.company_id = p_company_id AND d.unidade_id IS NOT DISTINCT FROM p_unidade_id AND d.data = p_data;

  IF v_id IS NOT NULL THEN
    UPDATE public.dp_dia_config
       SET limite_folgas = coalesce(p_limite, 0),
           observacao = nullif(btrim(coalesce(p_observacao,'')),''),
           updated_at = now()
     WHERE id = v_id;
  ELSE
    INSERT INTO public.dp_dia_config (company_id, unidade_id, data, limite_folgas, observacao, criado_por)
    VALUES (p_company_id, p_unidade_id, p_data, coalesce(p_limite,0),
            nullif(btrim(coalesce(p_observacao,'')),''), auth.uid())
    RETURNING id INTO v_id;
  END IF;

  PERFORM private.dp_regras_hist(
    p_company_id, 'Limite de folgas do dia', v_id, v_antigo,
    (SELECT to_jsonb(d) FROM public.dp_dia_config d WHERE d.id = v_id), NULL, false
  );
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.dp_dia_config_excluir(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.dp_dia_config;
BEGIN
  SELECT * INTO v_row FROM public.dp_dia_config WHERE id = p_id;
  IF v_row.id IS NULL THEN RETURN; END IF;
  PERFORM private.dp_regras_admin(v_row.company_id);
  DELETE FROM public.dp_dia_config WHERE id = p_id;
  PERFORM private.dp_regras_hist(
    v_row.company_id, 'Limite de folgas do dia — removido', p_id, to_jsonb(v_row), NULL, NULL, false
  );
END $$;

-- 7) Regras e períodos bloqueados de férias ---------------------------------
CREATE OR REPLACE FUNCTION public.dp_ferias_regra_salvar(p_company_id uuid, p_regra jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_patch jsonb; v_id uuid := nullif(p_regra->>'id','')::uuid; v_antigo jsonb;
  v_permitidos text[] := ARRAY['unidade_id','cargo_id','turno','max_simultaneos','ativo','observacao'];
BEGIN
  PERFORM private.dp_regras_admin(p_company_id);
  v_patch := private.dp_regras_campos(p_regra, v_permitidos);
  PERFORM private.dp_regras_faixa('max_simultaneos', private.dp_regras_numero(v_patch,'max_simultaneos'), 1, 999);
  PERFORM private.dp_regras_escopo(
    p_company_id,
    nullif(v_patch->>'unidade_id','')::uuid,
    nullif(v_patch->>'cargo_id','')::uuid
  );
  PERFORM private.dp_regras_fila(format('ferias_regra|%s', p_company_id));

  IF v_id IS NOT NULL THEN
    SELECT to_jsonb(r) INTO v_antigo FROM public.dp_ferias_regras r
     WHERE r.id = v_id AND r.company_id = p_company_id AND r.removido_em IS NULL;
    IF v_antigo IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    PERFORM private.dp_regras_atualizar('public.dp_ferias_regras'::regclass, v_id, v_patch, true);
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.dp_ferias_regras r
       WHERE r.company_id = p_company_id AND r.removido_em IS NULL
         AND r.unidade_id IS NOT DISTINCT FROM nullif(v_patch->>'unidade_id','')::uuid
         AND r.cargo_id IS NOT DISTINCT FROM nullif(v_patch->>'cargo_id','')::uuid
         AND r.turno::text IS NOT DISTINCT FROM nullif(v_patch->>'turno','')
    ) THEN
      SELECT r.id INTO v_id FROM public.dp_ferias_regras r
       WHERE r.company_id = p_company_id AND r.removido_em IS NULL
         AND r.unidade_id IS NOT DISTINCT FROM nullif(v_patch->>'unidade_id','')::uuid
         AND r.cargo_id IS NOT DISTINCT FROM nullif(v_patch->>'cargo_id','')::uuid
         AND r.turno::text IS NOT DISTINCT FROM nullif(v_patch->>'turno','')
       LIMIT 1;
      SELECT to_jsonb(r) INTO v_antigo FROM public.dp_ferias_regras r WHERE r.id = v_id;
      PERFORM private.dp_regras_atualizar('public.dp_ferias_regras'::regclass, v_id, v_patch, true);
    ELSE
      v_id := private.dp_regras_inserir(
        'public.dp_ferias_regras'::regclass,
        v_patch || jsonb_build_object('company_id', p_company_id)
      );
    END IF;
  END IF;

  PERFORM private.dp_regras_hist(
    p_company_id, 'Regra de férias simultâneas', v_id, v_antigo,
    (SELECT to_jsonb(r) FROM public.dp_ferias_regras r WHERE r.id = v_id), NULL, false
  );
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.dp_ferias_regra_excluir(p_id uuid, p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.dp_ferias_regras;
BEGIN
  SELECT * INTO v_row FROM public.dp_ferias_regras WHERE id = p_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM private.dp_regras_admin(v_row.company_id);
  IF v_row.removido_em IS NOT NULL THEN RETURN; END IF;
  UPDATE public.dp_ferias_regras
     SET ativo = false, removido_em = now(), removido_por = auth.uid(),
         removido_motivo = nullif(btrim(coalesce(p_motivo,'')),''), updated_at = now()
   WHERE id = p_id;
  PERFORM private.dp_regras_hist(
    v_row.company_id, 'Regra de férias simultâneas — excluída', p_id, to_jsonb(v_row), NULL, p_motivo, false
  );
END $$;

CREATE OR REPLACE FUNCTION public.dp_ferias_bloqueio_salvar(p_company_id uuid, p_bloqueio jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_patch jsonb; v_id uuid := nullif(p_bloqueio->>'id','')::uuid; v_antigo jsonb;
  v_ini date; v_fim date;
  v_permitidos text[] := ARRAY['unidade_id','nome','data_inicio','data_fim','recorrente_anual','permite_excecao','ativo','observacao'];
BEGIN
  PERFORM private.dp_regras_admin(p_company_id);
  v_patch := private.dp_regras_campos(p_bloqueio, v_permitidos);
  IF nullif(btrim(coalesce(v_patch->>'nome','')),'') IS NULL THEN RAISE EXCEPTION 'REGRA_NOME_OBRIGATORIO'; END IF;
  IF length(btrim(v_patch->>'nome')) > 120 THEN RAISE EXCEPTION 'REGRA_NOME_INVALIDO'; END IF;
  v_patch := v_patch || jsonb_build_object('nome', btrim(v_patch->>'nome'));
  v_ini := nullif(v_patch->>'data_inicio','')::date;
  v_fim := nullif(v_patch->>'data_fim','')::date;
  IF v_ini IS NULL OR v_fim IS NULL THEN RAISE EXCEPTION 'REGRA_DATA_OBRIGATORIA'; END IF;
  IF v_fim < v_ini THEN RAISE EXCEPTION 'REGRA_PERIODO_INVERTIDO'; END IF;
  IF v_fim - v_ini > 366 THEN RAISE EXCEPTION 'REGRA_PERIODO_LONGO'; END IF;
  PERFORM private.dp_regras_escopo(p_company_id, nullif(v_patch->>'unidade_id','')::uuid);
  PERFORM private.dp_regras_fila(format('ferias_bloq|%s', p_company_id));

  IF v_id IS NOT NULL THEN
    SELECT to_jsonb(b) INTO v_antigo FROM public.dp_ferias_bloqueios b
     WHERE b.id = v_id AND b.company_id = p_company_id AND b.removido_em IS NULL;
    IF v_antigo IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    PERFORM private.dp_regras_atualizar('public.dp_ferias_bloqueios'::regclass, v_id, v_patch, true);
  ELSE
    SELECT b.id INTO v_id FROM public.dp_ferias_bloqueios b
     WHERE b.company_id = p_company_id AND b.removido_em IS NULL
       AND b.unidade_id IS NOT DISTINCT FROM nullif(v_patch->>'unidade_id','')::uuid
       AND b.data_inicio = v_ini AND b.data_fim = v_fim
       AND upper(b.nome) = upper(v_patch->>'nome')
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      SELECT to_jsonb(b) INTO v_antigo FROM public.dp_ferias_bloqueios b WHERE b.id = v_id;
      PERFORM private.dp_regras_atualizar('public.dp_ferias_bloqueios'::regclass, v_id, v_patch, true);
    ELSE
      v_id := private.dp_regras_inserir(
        'public.dp_ferias_bloqueios'::regclass,
        v_patch || jsonb_build_object('company_id', p_company_id)
      );
    END IF;
  END IF;

  PERFORM private.dp_regras_hist(
    p_company_id, 'Período bloqueado para férias', v_id, v_antigo,
    (SELECT to_jsonb(b) FROM public.dp_ferias_bloqueios b WHERE b.id = v_id), NULL, false
  );
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.dp_ferias_bloqueio_excluir(p_id uuid, p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.dp_ferias_bloqueios;
BEGIN
  SELECT * INTO v_row FROM public.dp_ferias_bloqueios WHERE id = p_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM private.dp_regras_admin(v_row.company_id);
  IF v_row.removido_em IS NOT NULL THEN RETURN; END IF;
  UPDATE public.dp_ferias_bloqueios
     SET ativo = false, removido_em = now(), removido_por = auth.uid(),
         removido_motivo = nullif(btrim(coalesce(p_motivo,'')),''), updated_at = now()
   WHERE id = p_id;
  PERFORM private.dp_regras_hist(
    v_row.company_id, 'Período bloqueado para férias — excluído', p_id, to_jsonb(v_row), NULL, p_motivo, false
  );
END $$;

-- 8) Cobertura mínima -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_cobertura_minima_salvar(p_company_id uuid, p_regra jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_patch jsonb; v_id uuid := nullif(p_regra->>'id','')::uuid; v_antigo jsonb;
  v_ini date; v_fim date;
  v_permitidos text[] := ARRAY['unidade_id','cargo_id','dia_semana','turno','turno_id','minimo','ativo','vigencia_inicio','vigencia_fim'];
BEGIN
  PERFORM private.dp_regras_admin(p_company_id);
  v_patch := private.dp_regras_campos(p_regra, v_permitidos);
  PERFORM private.dp_regras_faixa('minimo', private.dp_regras_numero(v_patch,'minimo'), 0, 999);
  PERFORM private.dp_regras_faixa('dia_semana', private.dp_regras_numero(v_patch,'dia_semana'), 0, 6);
  v_ini := nullif(v_patch->>'vigencia_inicio','')::date;
  v_fim := nullif(v_patch->>'vigencia_fim','')::date;
  IF v_ini IS NOT NULL AND v_fim IS NOT NULL AND v_fim < v_ini THEN
    RAISE EXCEPTION 'REGRA_PERIODO_INVERTIDO';
  END IF;
  PERFORM private.dp_regras_escopo(
    p_company_id,
    nullif(v_patch->>'unidade_id','')::uuid,
    nullif(v_patch->>'cargo_id','')::uuid,
    NULL,
    nullif(v_patch->>'turno_id','')::uuid
  );
  PERFORM private.dp_regras_fila(format('cobertura|%s', p_company_id));

  IF v_id IS NOT NULL THEN
    SELECT to_jsonb(c) INTO v_antigo FROM public.dp_cobertura_minima c
     WHERE c.id = v_id AND c.company_id = p_company_id AND c.removido_em IS NULL;
    IF v_antigo IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    PERFORM private.dp_regras_atualizar('public.dp_cobertura_minima'::regclass, v_id, v_patch, true);
  ELSE
    SELECT c.id INTO v_id FROM public.dp_cobertura_minima c
     WHERE c.company_id = p_company_id AND c.removido_em IS NULL
       AND c.unidade_id IS NOT DISTINCT FROM nullif(v_patch->>'unidade_id','')::uuid
       AND c.cargo_id IS NOT DISTINCT FROM nullif(v_patch->>'cargo_id','')::uuid
       AND c.turno_id IS NOT DISTINCT FROM nullif(v_patch->>'turno_id','')::uuid
       AND c.dia_semana IS NOT DISTINCT FROM private.dp_regras_numero(v_patch,'dia_semana')::smallint
       AND c.vigencia_inicio IS NOT DISTINCT FROM v_ini
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      SELECT to_jsonb(c) INTO v_antigo FROM public.dp_cobertura_minima c WHERE c.id = v_id;
      PERFORM private.dp_regras_atualizar('public.dp_cobertura_minima'::regclass, v_id, v_patch, true);
    ELSE
      v_id := private.dp_regras_inserir(
        'public.dp_cobertura_minima'::regclass,
        v_patch || jsonb_build_object('company_id', p_company_id)
      );
    END IF;
  END IF;

  PERFORM private.dp_regras_hist(
    p_company_id, 'Cobertura mínima', v_id, v_antigo,
    (SELECT to_jsonb(c) FROM public.dp_cobertura_minima c WHERE c.id = v_id), NULL, false
  );
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.dp_cobertura_minima_excluir(p_id uuid, p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.dp_cobertura_minima;
BEGIN
  SELECT * INTO v_row FROM public.dp_cobertura_minima WHERE id = p_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM private.dp_regras_admin(v_row.company_id);
  IF v_row.removido_em IS NOT NULL THEN RETURN; END IF;
  UPDATE public.dp_cobertura_minima
     SET ativo = false, removido_em = now(), removido_por = auth.uid(),
         removido_motivo = nullif(btrim(coalesce(p_motivo,'')),''), updated_at = now()
   WHERE id = p_id;
  PERFORM private.dp_regras_hist(
    v_row.company_id, 'Cobertura mínima — excluída', p_id, to_jsonb(v_row), NULL, p_motivo, false
  );
END $$;

-- 9) Graus de parentesco aceitos -------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_admissao_regra_parentesco_definir(
  p_company_id uuid, p_parentesco text, p_dependente boolean, p_sesc boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p text := btrim(coalesce(p_parentesco,''));
BEGIN
  PERFORM private.dp_regras_admin(p_company_id);
  IF v_p = '' OR length(v_p) > 40 THEN RAISE EXCEPTION 'REGRA_PARENTESCO_INVALIDO'; END IF;
  PERFORM private.dp_regras_fila(format('parentesco|%s|%s', p_company_id, upper(v_p)));

  IF NOT coalesce(p_dependente,false) AND NOT coalesce(p_sesc,false) THEN
    DELETE FROM public.dp_admissao_regra_parentescos
     WHERE company_id = p_company_id AND parentesco = v_p;
    RETURN;
  END IF;

  INSERT INTO public.dp_admissao_regra_parentescos (company_id, parentesco, permite_dependente, permite_sesc)
  VALUES (p_company_id, v_p, coalesce(p_dependente,false), coalesce(p_sesc,false))
  ON CONFLICT (company_id, parentesco) DO UPDATE
    SET permite_dependente = excluded.permite_dependente,
        permite_sesc = excluded.permite_sesc,
        updated_at = now();
END $$;

-- 10) Dependentes ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_dependente_salvar(p_colaborador_id uuid, p_dependente jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid; v_patch jsonb; v_id uuid := nullif(p_dependente->>'id','')::uuid;
  v_antigo jsonb; v_cpf text;
  v_permitidos text[] := ARRAY['nome','data_nascimento','parentesco','cpf','deficiencia','laudo_validade',
    'conta_irrf','conta_salario_familia','vacinacao_em','frequencia_escolar_em','cessado_em','observacao'];
BEGIN
  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = p_colaborador_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM private.dp_regras_admin(v_company);

  v_patch := private.dp_regras_campos(p_dependente, v_permitidos, ARRAY['id','company_id','colaborador_id','created_at','updated_at']);
  IF nullif(btrim(coalesce(v_patch->>'nome','')),'') IS NULL THEN RAISE EXCEPTION 'REGRA_NOME_OBRIGATORIO'; END IF;
  IF length(btrim(v_patch->>'nome')) > 120 THEN RAISE EXCEPTION 'REGRA_NOME_INVALIDO'; END IF;
  v_patch := v_patch || jsonb_build_object('nome', upper(btrim(v_patch->>'nome')));
  IF nullif(btrim(coalesce(v_patch->>'parentesco','')),'') IS NULL THEN RAISE EXCEPTION 'REGRA_PARENTESCO_INVALIDO'; END IF;

  v_cpf := regexp_replace(coalesce(v_patch->>'cpf',''), '[^0-9]', '', 'g');
  IF v_cpf <> '' AND length(v_cpf) <> 11 THEN RAISE EXCEPTION 'REGRA_CPF_INVALIDO'; END IF;
  IF v_patch ? 'cpf' THEN
    v_patch := v_patch || jsonb_build_object('cpf', nullif(v_cpf,''));
  END IF;

  IF nullif(v_patch->>'data_nascimento','')::date > current_date THEN
    RAISE EXCEPTION 'REGRA_DATA_FUTURA';
  END IF;

  PERFORM private.dp_regras_fila(format('dependente|%s', p_colaborador_id));

  IF v_id IS NOT NULL THEN
    SELECT to_jsonb(d) INTO v_antigo FROM public.dp_dependentes d
     WHERE d.id = v_id AND d.colaborador_id = p_colaborador_id;
    IF v_antigo IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    PERFORM private.dp_regras_atualizar('public.dp_dependentes'::regclass, v_id, v_patch, true);
  ELSE
    SELECT d.id INTO v_id FROM public.dp_dependentes d
     WHERE d.colaborador_id = p_colaborador_id
       AND upper(btrim(d.nome)) = v_patch->>'nome'
       AND d.data_nascimento IS NOT DISTINCT FROM nullif(v_patch->>'data_nascimento','')::date
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      SELECT to_jsonb(d) INTO v_antigo FROM public.dp_dependentes d WHERE d.id = v_id;
      PERFORM private.dp_regras_atualizar('public.dp_dependentes'::regclass, v_id, v_patch, true);
    ELSE
      v_id := private.dp_regras_inserir(
        'public.dp_dependentes'::regclass,
        v_patch || jsonb_build_object('company_id', v_company, 'colaborador_id', p_colaborador_id)
      );
    END IF;
  END IF;

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.dp_dependente_excluir(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.dp_dependentes;
BEGIN
  SELECT * INTO v_row FROM public.dp_dependentes WHERE id = p_id;
  IF v_row.id IS NULL THEN RETURN; END IF;
  PERFORM private.dp_regras_admin(v_row.company_id);
  DELETE FROM public.dp_dependentes WHERE id = p_id;
  PERFORM private.dp_regras_hist(
    v_row.company_id, 'Dependente removido', p_id, to_jsonb(v_row), NULL, NULL, false
  );
END $$;

-- 11) Disponibilidade em outras unidades -----------------------------------
CREATE OR REPLACE FUNCTION public.dp_apoio_unidade_salvar(p_company_id uuid, p_apoio jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_patch jsonb; v_id uuid := nullif(p_apoio->>'id','')::uuid; v_antigo jsonb;
  v_pessoa uuid; v_colab uuid; v_unidade uuid;
  v_permitidos text[] := ARRAY['pessoa_apoio_id','colaborador_id','unidade_id','cargo_id','setor_id',
    'ativo','observacao','socio','pro_labore','horario'];
BEGIN
  PERFORM private.dp_regras_admin(p_company_id);
  v_patch := private.dp_regras_campos(p_apoio, v_permitidos);
  v_pessoa := nullif(v_patch->>'pessoa_apoio_id','')::uuid;
  v_colab := nullif(v_patch->>'colaborador_id','')::uuid;
  v_unidade := nullif(v_patch->>'unidade_id','')::uuid;

  IF v_unidade IS NULL THEN RAISE EXCEPTION 'REGRA_UNIDADE_OBRIGATORIA'; END IF;
  IF (v_pessoa IS NULL) = (v_colab IS NULL) THEN RAISE EXCEPTION 'REGRA_PESSOA_INVALIDA'; END IF;
  PERFORM private.dp_regras_faixa('pro_labore', private.dp_regras_numero(v_patch,'pro_labore'), 0, 1000000);
  PERFORM private.dp_regras_escopo(
    p_company_id, v_unidade,
    nullif(v_patch->>'cargo_id','')::uuid,
    nullif(v_patch->>'setor_id','')::uuid,
    NULL, v_colab, v_pessoa
  );
  PERFORM private.dp_regras_fila(format('apoio|%s|%s', coalesce(v_pessoa, v_colab), v_unidade));

  IF v_id IS NOT NULL THEN
    SELECT to_jsonb(a) INTO v_antigo FROM public.dp_apoio_unidades a
     WHERE a.id = v_id AND a.company_id = p_company_id;
    IF v_antigo IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    PERFORM private.dp_regras_atualizar('public.dp_apoio_unidades'::regclass, v_id, v_patch, true);
  ELSE
    SELECT a.id INTO v_id FROM public.dp_apoio_unidades a
     WHERE a.company_id = p_company_id AND a.unidade_id = v_unidade
       AND a.pessoa_apoio_id IS NOT DISTINCT FROM v_pessoa
       AND a.colaborador_id IS NOT DISTINCT FROM v_colab
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      SELECT to_jsonb(a) INTO v_antigo FROM public.dp_apoio_unidades a WHERE a.id = v_id;
      PERFORM private.dp_regras_atualizar('public.dp_apoio_unidades'::regclass, v_id, v_patch, true);
    ELSE
      v_id := private.dp_regras_inserir(
        'public.dp_apoio_unidades'::regclass,
        v_patch || jsonb_build_object('company_id', p_company_id, 'criado_por', auth.uid())
      );
    END IF;
  END IF;

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.dp_apoio_unidade_excluir(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.dp_apoio_unidades;
BEGIN
  SELECT * INTO v_row FROM public.dp_apoio_unidades WHERE id = p_id;
  IF v_row.id IS NULL THEN RETURN; END IF;
  PERFORM private.dp_regras_admin(v_row.company_id);
  DELETE FROM public.dp_apoio_unidades WHERE id = p_id;
  PERFORM private.dp_regras_hist(
    v_row.company_id, 'Disponibilidade em outra unidade — removida', p_id, to_jsonb(v_row), NULL, NULL, false
  );
END $$;

-- 12) Avisos e comentários do mural ---------------------------------------
CREATE OR REPLACE FUNCTION public.dp_aviso_salvar(p_company_id uuid, p_aviso jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_patch jsonb; v_id uuid := nullif(p_aviso->>'id','')::uuid;
  v_permitidos text[] := ARRAY['titulo','conteudo','prioridade','escopo','unidade_id','cargo_id',
    'colaborador_id','publicado_em','expira_em','fixado','arquivo_path','arquivo_mime',
    'leitura_obrigatoria','permitir_reacoes','permitir_comentarios'];
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
  IF v_patch ? 'escopo' AND (v_patch->>'escopo') NOT IN ('todos','unidade','cargo','colaborador') THEN
    RAISE EXCEPTION 'AVISO_ESCOPO_INVALIDO';
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
END $$;

CREATE OR REPLACE FUNCTION public.dp_aviso_excluir(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_avisos WHERE id = p_id;
  IF v_company IS NULL THEN RETURN; END IF;
  PERFORM private.dp_regras_admin(v_company);
  DELETE FROM public.dp_avisos WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION public.dp_aviso_comentar(
  p_aviso_id uuid, p_conteudo text, p_autor_nome text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_permite boolean; v_colab uuid; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT company_id, permitir_comentarios INTO v_company, v_permite
    FROM public.dp_avisos WHERE id = p_aviso_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT coalesce(v_permite, false) THEN RAISE EXCEPTION 'AVISO_SEM_COMENTARIOS'; END IF;

  SELECT id INTO v_colab FROM public.dp_colaboradores
   WHERE company_id = v_company AND user_id = auth.uid() LIMIT 1;

  IF v_colab IS NULL THEN
    PERFORM private.dp_regras_membro(v_company);
  END IF;

  IF nullif(btrim(coalesce(p_conteudo,'')),'') IS NULL THEN RAISE EXCEPTION 'COMENTARIO_VAZIO'; END IF;
  IF length(btrim(p_conteudo)) > 4000 THEN RAISE EXCEPTION 'COMENTARIO_LONGO'; END IF;

  INSERT INTO public.dp_avisos_comentarios (
    aviso_id, company_id, user_id, colaborador_id, autor_nome, conteudo, status
  ) VALUES (
    p_aviso_id, v_company, auth.uid(), v_colab,
    nullif(btrim(coalesce(p_autor_nome,'')),''), btrim(p_conteudo), 'pendente'
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.dp_aviso_comentario_excluir(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.dp_avisos_comentarios;
BEGIN
  SELECT * INTO v_row FROM public.dp_avisos_comentarios WHERE id = p_id;
  IF v_row.id IS NULL THEN RETURN; END IF;
  IF v_row.user_id IS DISTINCT FROM auth.uid() THEN
    PERFORM private.dp_regras_admin(v_row.company_id);
  END IF;
  DELETE FROM public.dp_avisos_comentarios WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION public.dp_aviso_comentario_moderar(p_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_avisos_comentarios WHERE id = p_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM private.dp_regras_admin(v_company);
  IF p_status NOT IN ('aprovado','oculto','pendente') THEN RAISE EXCEPTION 'COMENTARIO_STATUS_INVALIDO'; END IF;
  UPDATE public.dp_avisos_comentarios
     SET status = p_status, moderado_por = auth.uid(), moderado_em = now(), updated_at = now()
   WHERE id = p_id;
END $$;

-- 13) Registro de ciência de regra ----------------------------------------
CREATE OR REPLACE FUNCTION public.dp_regras_ciencia_registrar(
  p_company_id uuid,
  p_tabela text,
  p_registro_id uuid DEFAULT NULL,
  p_justificativa text DEFAULT NULL,
  p_valor_antigo jsonb DEFAULT NULL,
  p_valor_novo jsonb DEFAULT NULL,
  p_ciencia boolean DEFAULT true
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM private.dp_regras_membro(p_company_id);
  IF nullif(btrim(coalesce(p_tabela,'')),'') IS NULL THEN RAISE EXCEPTION 'REGRA_TABELA_OBRIGATORIA'; END IF;
  IF length(p_tabela) > 200 THEN RAISE EXCEPTION 'REGRA_TABELA_INVALIDA'; END IF;
  PERFORM private.dp_regras_hist(
    p_company_id, btrim(p_tabela), p_registro_id, p_valor_antigo, p_valor_novo,
    p_justificativa, coalesce(p_ciencia, true)
  );
END $$;

-- 14) Somente as rotinas oficiais gravam ----------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dp_config_dp','dp_bloqueios','dp_bloqueio_regras','dp_bloqueio_regra_unidades',
    'dp_datas_bloqueadas','dp_dia_config','dp_ferias_regras','dp_ferias_bloqueios',
    'dp_cobertura_minima','dp_admissao_regras','dp_admissao_regra_cargos','dp_admissao_regra_unidades',
    'dp_admissao_regra_regimes','dp_admissao_regra_sexos','dp_admissao_regra_parentescos',
    'dp_colaborador_jornadas','dp_dependentes','dp_apoio_unidades','dp_avisos','dp_avisos_comentarios',
    'dp_regras_historico'
  ] LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- 15) Permissões das rotinas oficiais -------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'dp_config_dp_salvar','dp_config_dp_excecao_excluir',
         'dp_bloqueio_regra_salvar','dp_bloqueio_regra_excluir',
         'dp_data_bloqueada_salvar','dp_datas_bloqueadas_definir_lote',
         'dp_data_bloqueada_excluir','dp_data_bloqueada_rebloquear',
         'dp_dia_config_definir','dp_dia_config_excluir',
         'dp_ferias_regra_salvar','dp_ferias_regra_excluir',
         'dp_ferias_bloqueio_salvar','dp_ferias_bloqueio_excluir',
         'dp_cobertura_minima_salvar','dp_cobertura_minima_excluir',
         'dp_admissao_regra_parentesco_definir',
         'dp_dependente_salvar','dp_dependente_excluir',
         'dp_apoio_unidade_salvar','dp_apoio_unidade_excluir',
         'dp_aviso_salvar','dp_aviso_excluir','dp_aviso_comentar',
         'dp_aviso_comentario_excluir','dp_aviso_comentario_moderar',
         'dp_regras_ciencia_registrar'
       )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
  END LOOP;
END $$;
