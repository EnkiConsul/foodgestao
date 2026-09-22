CREATE OR REPLACE FUNCTION public.dp_ferias_gerar_periodos(_colaborador_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_col record;
  v_base date;
  v_inicio date;
  v_fim date;
  v_limite date;
  v_corte date;
  v_criados int := 0;
BEGIN
  SELECT id, company_id, data_admissao, data_base_contagem, data_desligamento,
         vinculo_label, lower(COALESCE(regime::text, '')) AS regime
    INTO v_col
  FROM public.dp_colaboradores
  WHERE id = _colaborador_id;

  IF v_col.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_COLABORADOR_NAO_ENCONTRADO';
  END IF;

  IF NOT private.is_company_admin_or_owner(auth.uid(), v_col.company_id) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

  IF COALESCE(v_col.vinculo_label, '') ILIKE 'socio%'
     OR COALESCE(v_col.vinculo_label, '') ILIKE 'sócio%'
     OR v_col.regime NOT IN ('clt', 'intermitente', 'temporario', 'aprendiz') THEN
    UPDATE public.dp_ferias_periodos
       SET controle_externo = true,
           updated_at = now()
     WHERE colaborador_id = _colaborador_id
       AND controle_externo IS DISTINCT FROM true;
    RETURN 0;
  END IF;

  IF v_col.data_admissao IS NULL THEN
    RAISE EXCEPTION 'FERIAS_SEM_ADMISSAO';
  END IF;

  v_base := GREATEST(COALESCE(v_col.data_base_contagem, v_col.data_admissao), v_col.data_admissao);
  v_corte := GREATEST(COALESCE(public.dp_ferias_corte_efetivo(_colaborador_id), v_base), v_base);
  v_inicio := v_base;

  WHILE v_inicio <= COALESCE(v_col.data_desligamento, CURRENT_DATE) LOOP
    v_fim := (v_inicio + INTERVAL '1 year - 1 day')::date;
    v_limite := (v_fim + INTERVAL '1 year')::date;

    IF v_fim >= v_corte THEN
      INSERT INTO public.dp_ferias_periodos (
        company_id, colaborador_id, inicio_aquisitivo, fim_aquisitivo, limite_concessivo, criado_por
      ) VALUES (
        v_col.company_id, v_col.id, v_inicio, v_fim, v_limite, auth.uid()
      )
      ON CONFLICT (colaborador_id, inicio_aquisitivo) DO NOTHING;
      IF FOUND THEN v_criados := v_criados + 1; END IF;
    END IF;

    v_inicio := (v_inicio + INTERVAL '1 year')::date;
  END LOOP;

  UPDATE public.dp_ferias_periodos
     SET controle_externo = (fim_aquisitivo < v_corte OR inicio_aquisitivo < v_base),
         updated_at = now()
   WHERE colaborador_id = _colaborador_id
     AND controle_externo <> (fim_aquisitivo < v_corte OR inicio_aquisitivo < v_base);

  PERFORM public.dp_ferias_recalc_periodo(p.id)
  FROM public.dp_ferias_periodos p
  WHERE p.colaborador_id = _colaborador_id;

  RETURN v_criados;
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_ferias_gerar_periodos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ferias_gerar_periodos(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.dp_refresh_document_pending(p_company_id uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  DELETE FROM public.dp_pendencias_materializadas p
   WHERE p.doc_tipo IS NOT NULL
     AND (p_company_id IS NULL OR p.company_id = p_company_id);

  WITH empresas AS (
    SELECT c.id AS company_id,
           COALESCE(cfg.alerta_contracheque_dia_mes, 10) AS dia_contracheque,
           COALESCE(cfg.alerta_adiantamento_offset, 5) AS offset_adiantamento,
           COALESCE(cfg.alerta_folha_ponto_dia_mes, 10) AS dia_ponto,
           COALESCE(cfg.exigir_contracheque_mes_desligamento, false) AS cobra_contracheque_desligamento
      FROM public.companies c
      LEFT JOIN public.dp_pendencias_config cfg ON cfg.company_id = c.id
     WHERE p_company_id IS NULL OR c.id = p_company_id
  ), unidades AS (
    SELECT u.*, e.dia_contracheque, e.offset_adiantamento, e.dia_ponto,
           e.cobra_contracheque_desligamento,
           to_char((date_trunc('month', u.created_at AT TIME ZONE 'America/Sao_Paulo') - interval '1 month')::date, 'YYYY-MM') AS primeira_comp
      FROM public.dp_unidades u
      JOIN empresas e ON e.company_id = u.company_id
     WHERE u.ativo = true
  ), competencias AS (
    SELECT u.company_id, u.id AS unidade_id, u.nome AS unidade_nome,
           u.possui_relogio_ponto, u.tem_adiantamento, u.dia_adiantamento,
           u.dia_contracheque, u.offset_adiantamento, u.dia_ponto,
           u.cobra_contracheque_desligamento,
           to_char(gs, 'YYYY-MM') AS competencia,
           gs::date AS inicio_mes,
           (gs + interval '1 month - 1 day')::date AS fim_mes
      FROM unidades u
      CROSS JOIN LATERAL generate_series(
        GREATEST(date_trunc('month', v_today) - interval '23 months', to_date(u.primeira_comp || '-01', 'YYYY-MM-DD')),
        date_trunc('month', v_today), interval '1 month'
      ) gs
  ), candidatos AS (
    SELECT cp.*, c.id AS colaborador_id, c.nome AS colaborador_nome,
           lower(COALESCE(c.regime::text, '')) AS regime,
           lower(COALESCE(c.vinculo_label, '')) AS vinculo,
           c.possui_folha_ponto, c.optante_adiantamento,
           c.data_admissao::date AS admissao, c.data_desligamento::date AS desligamento,
           false AS tem_ponto,
           EXISTS (
             SELECT 1 FROM public.dp_documentos doc_ponto
              WHERE doc_ponto.company_id = cp.company_id
                AND doc_ponto.colaborador_id = c.id
                AND doc_ponto.tipo::text = 'ponto'
                AND doc_ponto.referencia_data BETWEEN cp.inicio_mes AND cp.fim_mes
           ) AS tem_folha_ponto_importada,
           EXISTS (
             SELECT 1 FROM public.dp_solicitacoes s
              WHERE s.company_id = cp.company_id
                AND s.colaborador_id = c.id
                AND s.status::text = 'aprovada'
                AND s.tipo::text IN ('atestado','licenca_maternidade','licenca_paternidade')
                AND s.data_alvo IS NOT NULL
                AND s.data_alvo::date <= GREATEST(cp.inicio_mes, COALESCE(c.data_admissao::date, cp.inicio_mes))
                AND COALESCE(s.data_fim::date, s.data_alvo::date) >= LEAST(cp.fim_mes, COALESCE(c.data_desligamento::date, cp.fim_mes))
           ) AS afastado_mes_inteiro,
           (SELECT ic.trabalhou FROM public.dp_intermitente_competencia_confirmacoes ic
             WHERE ic.company_id = cp.company_id AND ic.colaborador_id = c.id
               AND ic.competencia = cp.competencia LIMIT 1) AS intermitente_trabalhou,
           COALESCE(
             (SELECT s.tipo = 'ativar' FROM public.dp_adiantamento_solicitacoes s
               WHERE s.company_id = cp.company_id AND s.colaborador_id = c.id
                 AND s.competencia_efeito <= cp.competencia
               ORDER BY s.competencia_efeito DESC, s.data_solicitacao DESC, s.created_at DESC LIMIT 1),
             c.optante_adiantamento, false
           ) AS optante_comp
      FROM competencias cp
      JOIN public.dp_colaboradores c ON c.company_id = cp.company_id AND c.unidade_id = cp.unidade_id
       AND c.data_admissao::date <= cp.fim_mes
       AND (c.data_desligamento IS NULL OR c.data_desligamento::date >= cp.inicio_mes)
  ), elegiveis_regulares AS (
    SELECT c.*, d.doc_tipo,
      CASE d.doc_tipo
        WHEN 'contracheque' THEN (date_trunc('month', c.inicio_mes) + interval '1 month' + (LEAST(c.dia_contracheque, 28) - 1) * interval '1 day')::date
        WHEN 'ponto' THEN (date_trunc('month', c.inicio_mes) + interval '1 month' + (LEAST(c.dia_ponto, 28) - 1) * interval '1 day')::date
        WHEN 'adiantamento' THEN (date_trunc('month', c.inicio_mes) + (LEAST(COALESCE(c.dia_adiantamento, 1) + c.offset_adiantamento, 28) - 1) * interval '1 day')::date
        WHEN 'rescisao' THEN c.desligamento + 10
      END AS vencimento,
      false AS vinculo_historico
    FROM candidatos c
    CROSS JOIN (VALUES ('contracheque'), ('adiantamento'), ('ponto'), ('rescisao')) d(doc_tipo)
    WHERE lower(COALESCE(c.regime, '')) IN ('clt','intermitente','temporario','aprendiz')
      AND c.vinculo NOT LIKE '%sóci%'
      AND (
        (d.doc_tipo = 'contracheque' AND c.competencia < to_char(v_today, 'YYYY-MM')
          AND (c.regime <> 'intermitente' OR c.tem_ponto OR c.tem_folha_ponto_importada OR c.intermitente_trabalhou = true)
          AND (c.desligamento IS NULL OR to_char(c.desligamento, 'YYYY-MM') <> c.competencia OR c.cobra_contracheque_desligamento))
        OR (d.doc_tipo = 'ponto' AND c.competencia < to_char(v_today, 'YYYY-MM')
          AND c.possui_relogio_ponto = true AND c.possui_folha_ponto IS DISTINCT FROM false
          AND NOT c.afastado_mes_inteiro
          AND (c.regime <> 'intermitente' OR c.tem_ponto OR c.tem_folha_ponto_importada OR c.intermitente_trabalhou = true))
        OR (d.doc_tipo = 'adiantamento' AND c.competencia <= to_char(v_today, 'YYYY-MM')
          AND c.tem_adiantamento = true AND c.dia_adiantamento IS NOT NULL AND c.optante_comp
          AND NOT (to_char(c.admissao, 'YYYY-MM') = c.competencia AND extract(day FROM c.admissao) > c.dia_adiantamento)
          AND NOT (c.desligamento IS NOT NULL AND to_char(c.desligamento, 'YYYY-MM') = c.competencia AND extract(day FROM c.desligamento) < c.dia_adiantamento))
        OR (d.doc_tipo = 'rescisao' AND c.desligamento IS NOT NULL AND to_char(c.desligamento, 'YYYY-MM') = c.competencia)
      )
  ), historico_ordenado AS (
    SELECT h.*,
           lead(h.modo_continuidade) OVER (PARTITION BY h.colaborador_id ORDER BY h.vigencia_inicio) AS proximo_modo
      FROM public.dp_colaborador_historico_condicoes h
     WHERE p_company_id IS NULL OR h.company_id = p_company_id
  ), rescisao_historica AS (
    SELECT cp.*, c.id AS colaborador_id, c.nome AS colaborador_nome,
           lower(COALESCE(h.regime::text, '')) AS regime,
           lower(COALESCE(c.vinculo_label, '')) AS vinculo,
           c.possui_folha_ponto, c.optante_adiantamento,
           h.vigencia_inicio::date AS admissao, h.vigencia_fim::date AS desligamento,
           false AS tem_ponto, false AS tem_folha_ponto_importada,
           false AS afastado_mes_inteiro, NULL::boolean AS intermitente_trabalhou,
           false AS optante_comp, 'rescisao'::text AS doc_tipo,
           h.vigencia_fim::date + 10 AS vencimento, true AS vinculo_historico
      FROM historico_ordenado h
      JOIN public.dp_colaboradores c ON c.id = h.colaborador_id AND c.company_id = h.company_id
      JOIN competencias cp ON cp.company_id = h.company_id
       AND cp.unidade_id = COALESCE(h.unidade_id, c.unidade_id)
       AND cp.competencia = to_char(h.vigencia_fim, 'YYYY-MM')
     WHERE h.vigencia_fim IS NOT NULL
       AND h.proximo_modo = 'novo_contrato'
       AND lower(COALESCE(h.regime::text, '')) IN ('clt','intermitente','temporario','aprendiz')
       AND lower(COALESCE(c.vinculo_label, '')) NOT LIKE '%sóci%'
       AND NOT (c.data_desligamento IS NOT NULL AND c.data_desligamento::date = h.vigencia_fim::date)
  ), elegiveis AS (
    SELECT * FROM elegiveis_regulares
    UNION ALL
    SELECT * FROM rescisao_historica
  ), faltantes AS (
    SELECT e.*, count(*) OVER (PARTITION BY e.company_id, e.unidade_id, e.competencia, e.doc_tipo) AS total_elegiveis
      FROM elegiveis e
     WHERE NOT EXISTS (
       SELECT 1 FROM public.dp_documentos doc
        WHERE doc.company_id = e.company_id AND doc.colaborador_id = e.colaborador_id
          AND to_char(doc.referencia_data, 'YYYY-MM') = e.competencia
          AND ((e.doc_tipo <> 'rescisao' AND doc.tipo::text = e.doc_tipo)
            OR (e.doc_tipo = 'rescisao' AND doc.tipo::text IN ('desligamento','trct','demonstrativo_rescisorio')))
     )
  ), contagens AS (
    SELECT f.*, count(*) OVER (PARTITION BY f.company_id, f.unidade_id, f.competencia, f.doc_tipo) AS total_faltantes
      FROM faltantes f
  ), marcadas AS (
    SELECT f.*, (f.doc_tipo <> 'rescisao' AND f.total_elegiveis > 1 AND f.total_faltantes = f.total_elegiveis) AS lote
      FROM contagens f
  ), linhas AS (
    SELECT f.company_id,
      CASE WHEN f.lote THEN f.doc_tipo || '-' || f.unidade_id || '-' || replace(f.competencia, '-0', '-')
        ELSE f.doc_tipo || '-' || f.colaborador_id || '-' || replace(f.competencia, '-0', '-') END AS pendencia_id,
      CASE f.doc_tipo WHEN 'contracheque' THEN 'Contracheque não importado' WHEN 'adiantamento' THEN 'Adiantamento não importado' WHEN 'ponto' THEN 'Folha de ponto não importada' ELSE 'Rescisão não importada' END AS titulo,
      CASE WHEN f.lote THEN f.unidade_nome || ' — ' || f.competencia
        WHEN f.vinculo_historico THEN f.colaborador_nome || ' · ' || f.unidade_nome || ' — ' || f.competencia || ' · vínculo encerrado em ' || to_char(f.desligamento, 'DD/MM')
        ELSE f.colaborador_nome || ' · ' || f.unidade_nome || ' — ' || f.competencia END AS subtitulo,
      CASE f.doc_tipo WHEN 'contracheque' THEN 'Contracheque' WHEN 'adiantamento' THEN 'Adiantamento' WHEN 'ponto' THEN 'Folha de Ponto' ELSE 'Rescisão' END AS tipo,
      f.vencimento, (v_today - f.vencimento)::integer AS atraso_dias,
      '/dp/documentos?tipo=' || CASE WHEN f.doc_tipo = 'rescisao' THEN 'desligamento' ELSE f.doc_tipo END || '&competencia=' || f.competencia || '&unidade=' || f.unidade_id AS url,
      CASE WHEN f.lote THEN NULL ELSE f.colaborador_nome END AS colaborador_nome,
      f.unidade_nome, CASE WHEN f.lote THEN NULL ELSE f.colaborador_id END AS colaborador_id,
      f.competencia, f.doc_tipo, f.unidade_id,
      CASE WHEN f.lote THEN 'unidade' ELSE 'pessoa' END AS escopo,
      CASE WHEN f.lote THEN jsonb_agg(jsonb_build_object('nome', f.colaborador_nome, 'desligamento', f.desligamento)) OVER (PARTITION BY f.company_id, f.unidade_id, f.competencia, f.doc_tipo)
        ELSE jsonb_build_array(jsonb_build_object('nome', f.colaborador_nome, 'desligamento', f.desligamento)) END AS pessoas,
      CASE WHEN f.lote THEN f.total_faltantes::integer ELSE 1 END AS total_elegiveis,
      row_number() OVER (PARTITION BY f.company_id, f.unidade_id, f.competencia, f.doc_tipo,
        CASE WHEN f.lote THEN NULL ELSE f.colaborador_id END ORDER BY f.vinculo_historico DESC, f.colaborador_nome) AS rn
    FROM marcadas f
  )
  INSERT INTO public.dp_pendencias_materializadas (
    company_id, pendencia_id, titulo, subtitulo, tipo, vencimento, atraso_dias, url,
    colaborador_nome, unidade_nome, colaborador_id, competencia, doc_tipo, unidade_id,
    escopo, pessoas, total_elegiveis, apurado_em
  )
  SELECT company_id, pendencia_id, titulo, subtitulo, tipo, vencimento, atraso_dias, url,
         colaborador_nome, unidade_nome, colaborador_id, competencia, doc_tipo, unidade_id,
         escopo, pessoas, total_elegiveis, v_now
    FROM linhas WHERE rn = 1;

  INSERT INTO public.dp_pendencias_apuracoes (company_id, apurado_em, sujo_desde, updated_at)
  SELECT c.id, v_now, v_now, v_now FROM public.companies c
   WHERE p_company_id IS NULL OR c.id = p_company_id
  ON CONFLICT (company_id) DO UPDATE SET apurado_em = EXCLUDED.apurado_em,
    sujo_desde = EXCLUDED.sujo_desde, updated_at = EXCLUDED.updated_at;
END;
$function$;

REVOKE ALL ON FUNCTION private.dp_refresh_document_pending(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.dp_refresh_document_pending(uuid) TO service_role;

DROP TRIGGER IF EXISTS trg_dp_historico_pending_dirty ON public.dp_colaborador_historico_condicoes;
CREATE TRIGGER trg_dp_historico_pending_dirty
AFTER INSERT OR UPDATE OR DELETE ON public.dp_colaborador_historico_condicoes
FOR EACH ROW EXECUTE FUNCTION private.dp_mark_pending_dirty();