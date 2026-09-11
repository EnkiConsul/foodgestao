CREATE TABLE public.dp_pendencias_materializadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pendencia_id text NOT NULL,
  titulo text NOT NULL,
  subtitulo text NOT NULL,
  tipo text NOT NULL,
  vencimento date,
  atraso_dias integer NOT NULL DEFAULT 0,
  url text NOT NULL,
  colaborador_nome text,
  unidade_nome text,
  colaborador_id uuid,
  competencia text,
  doc_tipo text,
  unidade_id uuid,
  escopo text CHECK (escopo IS NULL OR escopo IN ('unidade', 'pessoa')),
  pessoas jsonb,
  total_elegiveis integer,
  apurado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, pendencia_id)
);
GRANT SELECT ON public.dp_pendencias_materializadas TO authenticated;
GRANT ALL ON public.dp_pendencias_materializadas TO service_role;
ALTER TABLE public.dp_pendencias_materializadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dp_pendencias_materializadas_select" ON public.dp_pendencias_materializadas
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));
CREATE INDEX idx_dp_pendencias_materializadas_company_order
  ON public.dp_pendencias_materializadas (company_id, atraso_dias DESC, vencimento);

CREATE TABLE public.dp_pendencias_apuracoes (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  apurado_em timestamptz,
  sujo_desde timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dp_pendencias_apuracoes TO authenticated;
GRANT ALL ON public.dp_pendencias_apuracoes TO service_role;
ALTER TABLE public.dp_pendencias_apuracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dp_pendencias_apuracoes_select" ON public.dp_pendencias_apuracoes
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE OR REPLACE FUNCTION private.dp_refresh_document_pending(p_company_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
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
           EXISTS (
             SELECT 1 FROM public.dp_pontos pt
              WHERE pt.company_id = cp.company_id AND pt.colaborador_id = c.id
                AND pt.data BETWEEN cp.inicio_mes AND cp.fim_mes
           ) AS tem_ponto,
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
  ), elegiveis AS (
    SELECT c.*, d.doc_tipo,
      CASE d.doc_tipo
        WHEN 'contracheque' THEN (date_trunc('month', c.inicio_mes) + interval '1 month' + (LEAST(c.dia_contracheque, 28) - 1) * interval '1 day')::date
        WHEN 'ponto' THEN (date_trunc('month', c.inicio_mes) + interval '1 month' + (LEAST(c.dia_ponto, 28) - 1) * interval '1 day')::date
        WHEN 'adiantamento' THEN (date_trunc('month', c.inicio_mes) + (LEAST(COALESCE(c.dia_adiantamento, 1) + c.offset_adiantamento, 28) - 1) * interval '1 day')::date
        WHEN 'rescisao' THEN c.desligamento + 10
      END AS vencimento
    FROM candidatos c
    CROSS JOIN (VALUES ('contracheque'), ('adiantamento'), ('ponto'), ('rescisao')) d(doc_tipo)
    WHERE
      lower(COALESCE(c.regime, '')) IN ('clt','intermitente','temporario','aprendiz')
      AND c.vinculo NOT LIKE '%sóci%'
      AND (
        (d.doc_tipo = 'contracheque'
          AND c.competencia < to_char(v_today, 'YYYY-MM')
          AND (c.regime <> 'intermitente' OR c.tem_ponto OR c.intermitente_trabalhou = true)
          AND (c.desligamento IS NULL OR to_char(c.desligamento, 'YYYY-MM') <> c.competencia OR c.cobra_contracheque_desligamento))
        OR (d.doc_tipo = 'ponto'
          AND c.competencia < to_char(v_today, 'YYYY-MM')
          AND c.possui_relogio_ponto = true AND c.possui_folha_ponto IS DISTINCT FROM false
          AND (c.regime <> 'intermitente' OR c.tem_ponto OR c.intermitente_trabalhou = true))
        OR (d.doc_tipo = 'adiantamento'
          AND c.competencia <= to_char(v_today, 'YYYY-MM')
          AND c.tem_adiantamento = true AND c.dia_adiantamento IS NOT NULL AND c.optante_comp
          AND NOT (to_char(c.admissao, 'YYYY-MM') = c.competencia AND extract(day FROM c.admissao) > c.dia_adiantamento)
          AND NOT (c.desligamento IS NOT NULL AND to_char(c.desligamento, 'YYYY-MM') = c.competencia AND extract(day FROM c.desligamento) < c.dia_adiantamento))
        OR (d.doc_tipo = 'rescisao'
          AND c.desligamento IS NOT NULL AND to_char(c.desligamento, 'YYYY-MM') = c.competencia)
      )
  ), faltantes AS (
    SELECT e.*,
           count(*) OVER (PARTITION BY e.company_id, e.unidade_id, e.competencia, e.doc_tipo) AS total_elegiveis
      FROM elegiveis e
     WHERE NOT EXISTS (
       SELECT 1 FROM public.dp_documentos doc
        WHERE doc.company_id = e.company_id AND doc.colaborador_id = e.colaborador_id
          AND to_char(doc.referencia_data, 'YYYY-MM') = e.competencia
          AND (
            (e.doc_tipo <> 'rescisao' AND doc.tipo::text = e.doc_tipo)
            OR (e.doc_tipo = 'rescisao' AND doc.tipo::text IN ('trct','demonstrativo_rescisorio'))
          )
     )
  ), contagens AS (
    SELECT f.*, count(*) OVER (PARTITION BY f.company_id, f.unidade_id, f.competencia, f.doc_tipo) AS total_faltantes
      FROM faltantes f
  ), linhas AS (
    SELECT f.company_id,
      CASE WHEN f.total_elegiveis > 1 AND f.total_faltantes = f.total_elegiveis
        THEN f.doc_tipo || '-' || f.unidade_id || '-' || replace(f.competencia, '-0', '-')
        ELSE f.doc_tipo || '-' || f.colaborador_id || '-' || replace(f.competencia, '-0', '-') END AS pendencia_id,
      CASE f.doc_tipo WHEN 'contracheque' THEN 'Contracheque não importado' WHEN 'adiantamento' THEN 'Adiantamento não importado' WHEN 'ponto' THEN 'Folha de ponto não importada' ELSE 'Rescisão não importada' END AS titulo,
      CASE WHEN f.total_elegiveis > 1 AND f.total_faltantes = f.total_elegiveis
        THEN f.unidade_nome || ' — ' || f.competencia
        ELSE f.colaborador_nome || ' · ' || f.unidade_nome || ' — ' || f.competencia END AS subtitulo,
      CASE f.doc_tipo WHEN 'contracheque' THEN 'Contracheque' WHEN 'adiantamento' THEN 'Adiantamento' WHEN 'ponto' THEN 'Folha de Ponto' ELSE 'Rescisão' END AS tipo,
      f.vencimento, (v_today - f.vencimento)::integer AS atraso_dias,
      '/dp/documentos?tipo=' || CASE WHEN f.doc_tipo = 'rescisao' THEN 'trct' ELSE f.doc_tipo END || '&competencia=' || f.competencia || '&unidade=' || f.unidade_id AS url,
      CASE WHEN f.total_elegiveis > 1 AND f.total_faltantes = f.total_elegiveis THEN NULL ELSE f.colaborador_nome END AS colaborador_nome,
      f.unidade_nome,
      CASE WHEN f.total_elegiveis > 1 AND f.total_faltantes = f.total_elegiveis THEN NULL ELSE f.colaborador_id END AS colaborador_id,
      f.competencia, f.doc_tipo, f.unidade_id,
      CASE WHEN f.total_elegiveis > 1 AND f.total_faltantes = f.total_elegiveis THEN 'unidade' ELSE 'pessoa' END AS escopo,
      CASE WHEN f.total_elegiveis > 1 AND f.total_faltantes = f.total_elegiveis
        THEN jsonb_agg(jsonb_build_object('nome', f.colaborador_nome, 'desligamento', f.desligamento))
             OVER (PARTITION BY f.company_id, f.unidade_id, f.competencia, f.doc_tipo)
        ELSE jsonb_build_array(jsonb_build_object('nome', f.colaborador_nome, 'desligamento', f.desligamento)) END AS pessoas,
      CASE WHEN f.total_elegiveis > 1 AND f.total_faltantes = f.total_elegiveis THEN f.total_faltantes::integer ELSE 1 END AS total_elegiveis,
      row_number() OVER (PARTITION BY f.company_id, f.unidade_id, f.competencia, f.doc_tipo,
        CASE WHEN f.total_elegiveis > 1 AND f.total_faltantes = f.total_elegiveis THEN NULL ELSE f.colaborador_id END
        ORDER BY f.colaborador_nome) AS rn
    FROM contagens f
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
  SELECT c.id, v_now, v_now, v_now
    FROM public.companies c
   WHERE p_company_id IS NULL OR c.id = p_company_id
  ON CONFLICT (company_id) DO UPDATE
    SET apurado_em = EXCLUDED.apurado_em,
        sujo_desde = EXCLUDED.sujo_desde,
        updated_at = EXCLUDED.updated_at;
END;
$$;
REVOKE ALL ON FUNCTION private.dp_refresh_document_pending(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.dp_refresh_document_pending(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.dp_refresh_my_company_pending(p_company_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE v_time timestamptz := now();
BEGIN
  IF NOT private.is_company_admin_or_owner((SELECT auth.uid()), p_company_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  PERFORM private.dp_refresh_document_pending(p_company_id);
  RETURN v_time;
END;
$$;
REVOKE ALL ON FUNCTION public.dp_refresh_my_company_pending(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_refresh_my_company_pending(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.dp_mark_pending_dirty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE v_company_id uuid := COALESCE(NEW.company_id, OLD.company_id);
BEGIN
  INSERT INTO public.dp_pendencias_apuracoes (company_id, sujo_desde, updated_at)
  VALUES (v_company_id, now(), now())
  ON CONFLICT (company_id) DO UPDATE SET sujo_desde = now(), updated_at = now();
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION private.dp_mark_pending_dirty() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_dp_documentos_pending_dirty AFTER INSERT OR UPDATE OR DELETE ON public.dp_documentos FOR EACH ROW EXECUTE FUNCTION private.dp_mark_pending_dirty();
CREATE TRIGGER trg_dp_colaboradores_pending_dirty AFTER INSERT OR UPDATE OR DELETE ON public.dp_colaboradores FOR EACH ROW EXECUTE FUNCTION private.dp_mark_pending_dirty();
CREATE TRIGGER trg_dp_unidades_pending_dirty AFTER INSERT OR UPDATE OR DELETE ON public.dp_unidades FOR EACH ROW EXECUTE FUNCTION private.dp_mark_pending_dirty();
CREATE TRIGGER trg_dp_adiantamento_pending_dirty AFTER INSERT OR UPDATE OR DELETE ON public.dp_adiantamento_solicitacoes FOR EACH ROW EXECUTE FUNCTION private.dp_mark_pending_dirty();
CREATE TRIGGER trg_dp_intermitente_pending_dirty AFTER INSERT OR UPDATE OR DELETE ON public.dp_intermitente_competencia_confirmacoes FOR EACH ROW EXECUTE FUNCTION private.dp_mark_pending_dirty();
CREATE TRIGGER trg_dp_pontos_pending_dirty AFTER INSERT OR UPDATE OR DELETE ON public.dp_pontos FOR EACH ROW EXECUTE FUNCTION private.dp_mark_pending_dirty();

SELECT private.dp_refresh_document_pending(NULL);

SELECT cron.schedule(
  'dp-refresh-document-pending-6-14-22-saopaulo',
  '0 1,9,17 * * *',
  $cron$ SELECT private.dp_refresh_document_pending(NULL); $cron$
);