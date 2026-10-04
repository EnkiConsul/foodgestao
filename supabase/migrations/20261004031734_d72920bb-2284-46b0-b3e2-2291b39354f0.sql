ALTER TABLE public.dp_pessoas_apoio
  ADD COLUMN IF NOT EXISTS banco_codigo text,
  ADD COLUMN IF NOT EXISTS banco_nome text,
  ADD COLUMN IF NOT EXISTS agencia text,
  ADD COLUMN IF NOT EXISTS conta text,
  ADD COLUMN IF NOT EXISTS conta_digito text,
  ADD COLUMN IF NOT EXISTS conta_tipo text,
  ADD COLUMN IF NOT EXISTS pix_tipo text,
  ADD COLUMN IF NOT EXISTS pix_chave text,
  ADD COLUMN IF NOT EXISTS documento_foto_path text;

CREATE TABLE public.dp_convocacao_substituicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  convocacao_id uuid NOT NULL REFERENCES public.dp_convocacoes(id) ON DELETE CASCADE,
  solicitante_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('colega','terceiro')),
  colega_id uuid REFERENCES public.dp_colaboradores(id) ON DELETE SET NULL,
  terceiro_nome text,
  terceiro_cpf text,
  terceiro_telefone text,
  banco_codigo text, banco_nome text, agencia text, conta text, conta_digito text, conta_tipo text,
  pix_tipo text, pix_chave text,
  documento_foto_path text,
  motivo text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('aguardando_colega','pendente_aprovacao','aprovada','rejeitada','recusada_colega','cancelada')),
  decidido_por uuid,
  decidido_em timestamptz,
  decisao_motivo text,
  pessoa_apoio_id uuid REFERENCES public.dp_pessoas_apoio(id) ON DELETE SET NULL,
  nova_convocacao_id uuid REFERENCES public.dp_convocacoes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_dp_conv_subst_aberta ON public.dp_convocacao_substituicoes(convocacao_id)
  WHERE status IN ('aguardando_colega','pendente_aprovacao');
CREATE INDEX ix_dp_conv_subst_company ON public.dp_convocacao_substituicoes(company_id, status);

GRANT SELECT ON public.dp_convocacao_substituicoes TO authenticated;
GRANT ALL ON public.dp_convocacao_substituicoes TO service_role;
ALTER TABLE public.dp_convocacao_substituicoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY dp_conv_subst_select ON public.dp_convocacao_substituicoes
  FOR SELECT TO authenticated USING (
    private.is_company_admin_or_owner(auth.uid(), company_id)
    OR solicitante_id = public.dp_colaborador_ativo_of(auth.uid())
    OR colega_id = public.dp_colaborador_ativo_of(auth.uid())
  );
CREATE TRIGGER trg_dp_conv_subst_updated BEFORE UPDATE ON public.dp_convocacao_substituicoes
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

-- Colegas elegíveis: mesmo cargo, convocáveis, ativos, sem convocação ativa nem indisponibilidade no dia
CREATE OR REPLACE FUNCTION public.dp_convocacao_colegas_substitutos(p_convocacao_id uuid)
RETURNS TABLE(colaborador_id uuid, nome text, cargo_nome text, unidade_nome text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_me uuid := public.dp_colaborador_ativo_of(auth.uid()); c public.dp_convocacoes%ROWTYPE; v_cargo uuid;
BEGIN
  SELECT * INTO c FROM public.dp_convocacoes WHERE id = p_convocacao_id;
  IF NOT FOUND OR c.colaborador_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'FORBIDDEN: convocação não pertence a você.' USING ERRCODE='42501';
  END IF;
  SELECT cargo_id INTO v_cargo FROM public.dp_colaboradores WHERE id = c.colaborador_id;
  RETURN QUERY
  SELECT o.id, o.nome, cg.nome, u.nome
    FROM public.dp_colaboradores o
    LEFT JOIN public.dp_cargos cg ON cg.id = o.cargo_id
    LEFT JOIN public.dp_unidades u ON u.id = o.unidade_id
   WHERE o.company_id = c.company_id AND o.id <> c.colaborador_id
     AND o.ativo AND o.deleted_at IS NULL
     AND COALESCE(public.dp_regime_convocavel(o.regime), false)
     AND v_cargo IS NOT NULL AND o.cargo_id = v_cargo
     AND NOT EXISTS (SELECT 1 FROM public.dp_convocacoes x WHERE x.colaborador_id = o.id
                      AND x.data = c.data AND x.status IN ('pendente','aceita'))
     AND NOT EXISTS (SELECT 1 FROM public.dp_indisponibilidades i WHERE i.colaborador_id = o.id
                      AND i.data = c.data AND i.cancelada_em IS NULL)
   ORDER BY o.nome;
END $$;

CREATE OR REPLACE FUNCTION public.dp_convocacao_substituicao_solicitar(
  p_convocacao_id uuid, p_tipo text, p_colega_id uuid DEFAULT NULL, p_dados jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_me uuid := public.dp_colaborador_ativo_of(auth.uid()); c public.dp_convocacoes%ROWTYPE; v_id uuid;
  v_doc text := NULLIF(btrim(p_dados->>'documento_foto_path'),'');
  v_cpf text := regexp_replace(COALESCE(p_dados->>'cpf',''), '\D', '', 'g');
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'FORBIDDEN: vínculo não encontrado.' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_convocacao_id::text || '|convocacao', 0));
  SELECT * INTO c FROM public.dp_convocacoes WHERE id = p_convocacao_id FOR UPDATE;
  IF NOT FOUND OR c.colaborador_id <> v_me THEN
    RAISE EXCEPTION 'FORBIDDEN: convocação não pertence a você.' USING ERRCODE='42501'; END IF;
  IF c.status <> 'aceita' THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: só é possível passar um plantão já aceito.' USING ERRCODE='check_violation'; END IF;
  IF c.data < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'DATA_PASSADA: este plantão já passou.' USING ERRCODE='check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM public.dp_convocacao_substituicoes s WHERE s.convocacao_id = c.id
             AND s.status IN ('aguardando_colega','pendente_aprovacao')) THEN
    RAISE EXCEPTION 'JA_EXISTE: já há um pedido de substituição em andamento para este plantão.' USING ERRCODE='check_violation'; END IF;

  IF p_tipo = 'colega' THEN
    IF NOT EXISTS (SELECT 1 FROM public.dp_convocacao_colegas_substitutos(c.id) s WHERE s.colaborador_id = p_colega_id) THEN
      RAISE EXCEPTION 'COLEGA_INDISPONIVEL: este colega não é do mesmo cargo ou já está escalado/indisponível nesta data.' USING ERRCODE='check_violation'; END IF;
    INSERT INTO public.dp_convocacao_substituicoes(company_id, convocacao_id, solicitante_id, tipo, colega_id, motivo, status)
    VALUES (c.company_id, c.id, v_me, 'colega', p_colega_id, NULLIF(btrim(p_dados->>'motivo'),''), 'aguardando_colega')
    RETURNING id INTO v_id;
  ELSIF p_tipo = 'terceiro' THEN
    IF length(btrim(COALESCE(p_dados->>'nome',''))) < 5 THEN
      RAISE EXCEPTION 'DADOS_INCOMPLETOS: informe o nome completo do folguista.' USING ERRCODE='22023'; END IF;
    IF length(v_cpf) <> 11 THEN
      RAISE EXCEPTION 'DADOS_INCOMPLETOS: informe o CPF do folguista com 11 dígitos.' USING ERRCODE='22023'; END IF;
    IF length(regexp_replace(COALESCE(p_dados->>'telefone',''), '\D','','g')) < 10 THEN
      RAISE EXCEPTION 'DADOS_INCOMPLETOS: informe o WhatsApp do folguista com DDD.' USING ERRCODE='22023'; END IF;
    IF NULLIF(btrim(p_dados->>'pix_chave'),'') IS NULL AND
       (NULLIF(btrim(p_dados->>'agencia'),'') IS NULL OR NULLIF(btrim(p_dados->>'conta'),'') IS NULL) THEN
      RAISE EXCEPTION 'DADOS_INCOMPLETOS: informe a chave Pix ou banco, agência e conta do folguista.' USING ERRCODE='22023'; END IF;
    IF v_doc IS NULL OR split_part(v_doc,'/',1) <> c.company_id::text OR split_part(v_doc,'/',2) <> v_me::text THEN
      RAISE EXCEPTION 'DADOS_INCOMPLETOS: anexe o documento com foto do folguista.' USING ERRCODE='22023'; END IF;
    INSERT INTO public.dp_convocacao_substituicoes(company_id, convocacao_id, solicitante_id, tipo,
      terceiro_nome, terceiro_cpf, terceiro_telefone, banco_codigo, banco_nome, agencia, conta, conta_digito, conta_tipo,
      pix_tipo, pix_chave, documento_foto_path, motivo, status)
    VALUES (c.company_id, c.id, v_me, 'terceiro', upper(btrim(p_dados->>'nome')), v_cpf,
      regexp_replace(p_dados->>'telefone', '\D','','g'),
      NULLIF(btrim(p_dados->>'banco_codigo'),''), NULLIF(btrim(p_dados->>'banco_nome'),''),
      NULLIF(btrim(p_dados->>'agencia'),''), NULLIF(btrim(p_dados->>'conta'),''),
      NULLIF(btrim(p_dados->>'conta_digito'),''), NULLIF(btrim(p_dados->>'conta_tipo'),''),
      NULLIF(btrim(p_dados->>'pix_tipo'),''), NULLIF(btrim(p_dados->>'pix_chave'),''),
      v_doc, NULLIF(btrim(p_dados->>'motivo'),''), 'pendente_aprovacao')
    RETURNING id INTO v_id;
  ELSE
    RAISE EXCEPTION 'INVALID_INPUT: tipo de substituição inválido.' USING ERRCODE='22023';
  END IF;
  RETURN v_id;
END $$;

-- Transferência para colega cadastrado (uso interno)
CREATE OR REPLACE FUNCTION private.dp_conv_subst_transferir_colega(p_sub uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s public.dp_convocacao_substituicoes%ROWTYPE; c public.dp_convocacoes%ROWTYPE; v_nova uuid;
BEGIN
  SELECT * INTO s FROM public.dp_convocacao_substituicoes WHERE id = p_sub FOR UPDATE;
  SELECT * INTO c FROM public.dp_convocacoes WHERE id = s.convocacao_id FOR UPDATE;
  IF c.status <> 'aceita' THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: o plantão original não está mais aceito.' USING ERRCODE='check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM public.dp_convocacoes x WHERE x.colaborador_id = s.colega_id AND x.data = c.data AND x.status IN ('pendente','aceita')) THEN
    RAISE EXCEPTION 'COLEGA_INDISPONIVEL: o colega já está escalado nesta data.' USING ERRCODE='check_violation'; END IF;
  UPDATE public.dp_convocacoes SET status = 'substituida', encerrada_em = now(),
    encerramento_motivo = 'Plantão passado ao colega cadastrado' WHERE id = c.id;
  INSERT INTO public.dp_convocacoes(company_id, unidade_id, colaborador_id, turno_id, data, entrada, saida,
    intervalo_minutos, termina_no_dia_seguinte, carga_prevista_horas, status, enviada_em, respondida_em,
    observacao, criada_por, inicio_previsto, fim_previsto, timezone_snapshot, origem_oferta, substitui_convocacao_id, resposta_tipo)
  VALUES (c.company_id, c.unidade_id, s.colega_id, c.turno_id, c.data, c.entrada, c.saida,
    c.intervalo_minutos, c.termina_no_dia_seguinte, c.carga_prevista_horas, 'aceita', now(), now(),
    c.observacao, auth.uid(), c.inicio_previsto, c.fim_previsto, c.timezone_snapshot, 'substituicao', c.id, 'integral')
  RETURNING id INTO v_nova;
  UPDATE public.dp_convocacoes SET substituida_por_id = v_nova WHERE id = c.id;
  RETURN v_nova;
END $$;
REVOKE ALL ON FUNCTION private.dp_conv_subst_transferir_colega(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dp_convocacao_substituicao_responder_colega(p_id uuid, p_aceitar boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_me uuid := public.dp_colaborador_ativo_of(auth.uid()); s public.dp_convocacao_substituicoes%ROWTYPE; v_nova uuid;
BEGIN
  SELECT * INTO s FROM public.dp_convocacao_substituicoes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR s.colega_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'FORBIDDEN: este convite não é para você.' USING ERRCODE='42501'; END IF;
  IF s.status <> 'aguardando_colega' THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: este convite já foi respondido ou cancelado.' USING ERRCODE='check_violation'; END IF;
  IF NOT p_aceitar THEN
    UPDATE public.dp_convocacao_substituicoes SET status='recusada_colega', decidido_em=now(), decidido_por=auth.uid() WHERE id=p_id;
    RETURN 'recusada_colega';
  END IF;
  v_nova := private.dp_conv_subst_transferir_colega(p_id);
  UPDATE public.dp_convocacao_substituicoes SET status='aprovada', decidido_em=now(), decidido_por=auth.uid(), nova_convocacao_id=v_nova WHERE id=p_id;
  RETURN 'aprovada';
END $$;

CREATE OR REPLACE FUNCTION public.dp_convocacao_substituicao_cancelar(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_me uuid := public.dp_colaborador_ativo_of(auth.uid());
BEGIN
  UPDATE public.dp_convocacao_substituicoes SET status='cancelada', decidido_em=now(), decidido_por=auth.uid()
   WHERE id=p_id AND solicitante_id = v_me AND status IN ('aguardando_colega','pendente_aprovacao');
  IF NOT FOUND THEN RAISE EXCEPTION 'STATUS_INVALIDO: pedido não encontrado ou já decidido.' USING ERRCODE='check_violation'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.dp_convocacao_substituicao_decidir(p_id uuid, p_aprovar boolean, p_motivo text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s public.dp_convocacao_substituicoes%ROWTYPE; c public.dp_convocacoes%ROWTYPE; v_cargo uuid; v_setor uuid; v_pa uuid;
BEGIN
  SELECT * INTO s FROM public.dp_convocacao_substituicoes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT private.is_company_admin_or_owner(auth.uid(), s.company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas responsáveis da empresa decidem substituições.' USING ERRCODE='42501'; END IF;
  IF s.status <> 'pendente_aprovacao' THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: este pedido já foi decidido.' USING ERRCODE='check_violation'; END IF;
  IF NOT p_aprovar THEN
    IF length(btrim(COALESCE(p_motivo,''))) < 5 THEN
      RAISE EXCEPTION 'MOTIVO_OBRIGATORIO: explique o motivo da recusa (mín. 5 caracteres).' USING ERRCODE='22023'; END IF;
    UPDATE public.dp_convocacao_substituicoes SET status='rejeitada', decidido_em=now(), decidido_por=auth.uid(), decisao_motivo=btrim(p_motivo) WHERE id=p_id;
    RETURN 'rejeitada';
  END IF;
  SELECT * INTO c FROM public.dp_convocacoes WHERE id = s.convocacao_id FOR UPDATE;
  IF c.status <> 'aceita' THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: o plantão original não está mais aceito.' USING ERRCODE='check_violation'; END IF;
  SELECT cargo_id, setor_id INTO v_cargo, v_setor FROM public.dp_colaboradores WHERE id = s.solicitante_id;

  SELECT id INTO v_pa FROM public.dp_pessoas_apoio WHERE company_id = s.company_id AND cpf = s.terceiro_cpf LIMIT 1;
  IF v_pa IS NULL THEN
    INSERT INTO public.dp_pessoas_apoio(company_id, nome, telefone, tipo, cargo_id, unidade_id, cpf, observacao,
      banco_codigo, banco_nome, agencia, conta, conta_digito, conta_tipo, pix_tipo, pix_chave, documento_foto_path, ativo, criado_por)
    VALUES (s.company_id, s.terceiro_nome, s.terceiro_telefone, 'folguista', v_cargo, c.unidade_id, s.terceiro_cpf,
      'Indicado por substituição de plantão', s.banco_codigo, s.banco_nome, s.agencia, s.conta, s.conta_digito, s.conta_tipo,
      s.pix_tipo, s.pix_chave, s.documento_foto_path, true, auth.uid())
    RETURNING id INTO v_pa;
  ELSE
    UPDATE public.dp_pessoas_apoio SET
      telefone = COALESCE(s.terceiro_telefone, telefone),
      banco_codigo = COALESCE(s.banco_codigo, banco_codigo), banco_nome = COALESCE(s.banco_nome, banco_nome),
      agencia = COALESCE(s.agencia, agencia), conta = COALESCE(s.conta, conta),
      conta_digito = COALESCE(s.conta_digito, conta_digito), conta_tipo = COALESCE(s.conta_tipo, conta_tipo),
      pix_tipo = COALESCE(s.pix_tipo, pix_tipo), pix_chave = COALESCE(s.pix_chave, pix_chave),
      documento_foto_path = COALESCE(s.documento_foto_path, documento_foto_path), ativo = true
     WHERE id = v_pa;
  END IF;

  UPDATE public.dp_convocacoes SET status='substituida', encerrada_em=now(),
    encerramento_motivo = 'Plantão coberto pelo folguista ' || s.terceiro_nome WHERE id = c.id;
  UPDATE public.dp_convocacao_substituicoes SET status='aprovada', decidido_em=now(), decidido_por=auth.uid(),
    decisao_motivo = NULLIF(btrim(COALESCE(p_motivo,'')),''), pessoa_apoio_id = v_pa WHERE id = p_id;
  RETURN 'aprovada';
END $$;

-- Detalhe do dia para o calendário do gestor
CREATE OR REPLACE FUNCTION public.dp_disponibilidade_dia(_company_id uuid, _unidade_id uuid, _data date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb;
BEGIN
  IF NOT private.is_company_admin_or_owner(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas responsáveis da empresa podem consultar.' USING ERRCODE='42501'; END IF;
  WITH conv AS (
    SELECT c.id, c.nome, c.unidade_id, c.cargo_id FROM public.dp_colaboradores c
     WHERE c.company_id = _company_id AND c.ativo AND c.deleted_at IS NULL
       AND COALESCE(public.dp_regime_convocavel(c.regime), false)
       AND (_unidade_id IS NULL OR c.unidade_id = _unidade_id)
  ), cv AS (
    SELECT v.colaborador_id, v.status::text AS status, v.entrada, v.saida, v.origem_oferta
      FROM public.dp_convocacoes v WHERE v.company_id = _company_id AND v.data = _data
       AND v.status IN ('pendente','aceita') AND (_unidade_id IS NULL OR v.unidade_id = _unidade_id)
  ), ind AS (
    SELECT i.colaborador_id, i.motivo, i.alteracao_tardia FROM public.dp_indisponibilidades i
      JOIN conv ON conv.id = i.colaborador_id WHERE i.data = _data AND i.cancelada_em IS NULL
  )
  SELECT jsonb_build_object(
    'convocados', COALESCE((SELECT jsonb_agg(jsonb_build_object('colaborador_id', o.id, 'nome', o.nome,
        'cargo_nome', cg.nome, 'unidade_nome', u.nome, 'status', cv.status,
        'entrada', to_char(cv.entrada,'HH24:MI'), 'saida', to_char(cv.saida,'HH24:MI'),
        'substituicao', cv.origem_oferta = 'substituicao') ORDER BY o.nome)
      FROM cv JOIN public.dp_colaboradores o ON o.id = cv.colaborador_id
      LEFT JOIN public.dp_cargos cg ON cg.id = o.cargo_id LEFT JOIN public.dp_unidades u ON u.id = o.unidade_id), '[]'::jsonb),
    'folguistas', COALESCE((SELECT jsonb_agg(jsonb_build_object('nome', s.terceiro_nome, 'telefone', s.terceiro_telefone,
        'no_lugar_de', sol.nome) ORDER BY s.terceiro_nome)
      FROM public.dp_convocacao_substituicoes s JOIN public.dp_convocacoes v ON v.id = s.convocacao_id
      JOIN public.dp_colaboradores sol ON sol.id = s.solicitante_id
      WHERE s.company_id = _company_id AND s.tipo='terceiro' AND s.status='aprovada' AND v.data = _data
        AND (_unidade_id IS NULL OR v.unidade_id = _unidade_id)), '[]'::jsonb),
    'disponiveis', COALESCE((SELECT jsonb_agg(jsonb_build_object('colaborador_id', conv.id, 'nome', conv.nome,
        'cargo_nome', cg.nome, 'unidade_nome', u.nome) ORDER BY conv.nome)
      FROM conv LEFT JOIN public.dp_cargos cg ON cg.id = conv.cargo_id LEFT JOIN public.dp_unidades u ON u.id = conv.unidade_id
      WHERE NOT EXISTS (SELECT 1 FROM cv WHERE cv.colaborador_id = conv.id)
        AND NOT EXISTS (SELECT 1 FROM ind WHERE ind.colaborador_id = conv.id)), '[]'::jsonb),
    'indisponiveis', COALESCE((SELECT jsonb_agg(jsonb_build_object('colaborador_id', conv.id, 'nome', conv.nome,
        'cargo_nome', cg.nome, 'unidade_nome', u.nome, 'motivo', ind.motivo, 'alteracao_tardia', ind.alteracao_tardia) ORDER BY conv.nome)
      FROM ind JOIN conv ON conv.id = ind.colaborador_id
      LEFT JOIN public.dp_cargos cg ON cg.id = conv.cargo_id LEFT JOIN public.dp_unidades u ON u.id = conv.unidade_id), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END $$;

-- Fórmula de disponíveis: desconta quem já está convocado (pendente/aceita)
CREATE OR REPLACE FUNCTION public.dp_disponibilidade_painel(_company_id uuid, _unidade_id uuid DEFAULT NULL::uuid, _competencia date DEFAULT NULL::date)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_janela jsonb; v_comp date; v_ini date; v_fim date;
  v_convocaveis int := 0; v_responderam int := 0; v_tardias int := 0; v_dias jsonb; v_colabs jsonb;
BEGIN
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a empresa.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_company_admin_or_owner(_company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas responsáveis da empresa podem consultar a disponibilidade.' USING ERRCODE = '42501';
  END IF;
  v_janela := public.dp_disponibilidade_janela(_company_id, _unidade_id, _competencia);
  v_comp := (v_janela->>'competencia')::date;
  v_ini := v_comp;
  v_fim := (v_comp + interval '1 month - 1 day')::date;

  WITH conv AS (
    SELECT c.id, c.nome, c.regime, c.unidade_id, c.cargo_id FROM public.dp_colaboradores c
     WHERE c.company_id = _company_id AND c.ativo = true AND c.deleted_at IS NULL
       AND COALESCE(public.dp_regime_convocavel(c.regime), false)
       AND (_unidade_id IS NULL OR c.unidade_id = _unidade_id)
  ), ind AS (
    SELECT i.colaborador_id, count(*)::int AS dias, count(*) FILTER (WHERE i.alteracao_tardia)::int AS tardias, max(i.informada_em) AS ultima
      FROM public.dp_indisponibilidades i JOIN conv ON conv.id = i.colaborador_id
     WHERE i.cancelada_em IS NULL AND i.data BETWEEN v_ini AND v_fim
     GROUP BY i.colaborador_id
  )
  SELECT count(*)::int, count(*) FILTER (WHERE ind.colaborador_id IS NOT NULL)::int, COALESCE(sum(ind.tardias), 0)::int,
         COALESCE(jsonb_agg(jsonb_build_object('colaborador_id', conv.id, 'nome', conv.nome, 'regime', conv.regime,
             'unidade_nome', u.nome, 'cargo_nome', cg.nome, 'dias_indisponiveis', COALESCE(ind.dias, 0),
             'alteracoes_tardias', COALESCE(ind.tardias, 0), 'informou', ind.colaborador_id IS NOT NULL,
             'ultima_informacao', ind.ultima)
           ORDER BY (ind.colaborador_id IS NOT NULL), conv.nome), '[]'::jsonb)
    INTO v_convocaveis, v_responderam, v_tardias, v_colabs
    FROM conv LEFT JOIN ind ON ind.colaborador_id = conv.id
    LEFT JOIN public.dp_unidades u ON u.id = conv.unidade_id
    LEFT JOIN public.dp_cargos cg ON cg.id = conv.cargo_id;

  WITH conv AS (
    SELECT c.id FROM public.dp_colaboradores c
     WHERE c.company_id = _company_id AND c.ativo = true AND c.deleted_at IS NULL
       AND COALESCE(public.dp_regime_convocavel(c.regime), false)
       AND (_unidade_id IS NULL OR c.unidade_id = _unidade_id)
  ), dias AS (
    SELECT d::date AS data FROM generate_series(v_ini, v_fim, interval '1 day') d
  ), agg AS (
    SELECT dias.data,
      (SELECT count(*) FROM public.dp_indisponibilidades i JOIN conv ON conv.id = i.colaborador_id
        WHERE i.cancelada_em IS NULL AND i.data = dias.data)::int AS indisponiveis,
      (SELECT count(*) FROM public.dp_convocacoes v JOIN conv ON conv.id = v.colaborador_id
        WHERE v.data = dias.data AND v.status = 'pendente')::int AS pendentes,
      (SELECT count(*) FROM public.dp_convocacoes v JOIN conv ON conv.id = v.colaborador_id
        WHERE v.data = dias.data AND v.status = 'aceita')::int AS aceitas,
      (SELECT count(*) FROM conv WHERE NOT EXISTS (SELECT 1 FROM public.dp_convocacoes v WHERE v.colaborador_id = conv.id
          AND v.data = dias.data AND v.status IN ('pendente','aceita'))
        AND NOT EXISTS (SELECT 1 FROM public.dp_indisponibilidades i WHERE i.colaborador_id = conv.id
          AND i.data = dias.data AND i.cancelada_em IS NULL))::int AS disponiveis
    FROM dias
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('data', agg.data, 'indisponiveis', agg.indisponiveis,
           'disponiveis', agg.disponiveis, 'pendentes', agg.pendentes, 'aceitas', agg.aceitas) ORDER BY agg.data), '[]'::jsonb)
    INTO v_dias FROM agg;

  RETURN jsonb_build_object('janela', v_janela,
    'resumo', jsonb_build_object('convocaveis', v_convocaveis, 'informaram', v_responderam,
      'sem_informacao', GREATEST(v_convocaveis - v_responderam, 0), 'alteracoes_tardias', v_tardias),
    'dias', v_dias, 'colaboradores', v_colabs);
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_convocacao_colegas_substitutos(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_substituicao_solicitar(uuid, text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_substituicao_responder_colega(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_substituicao_cancelar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_substituicao_decidir(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_disponibilidade_dia(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_colegas_substitutos(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_substituicao_solicitar(uuid, text, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_substituicao_responder_colega(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_substituicao_cancelar(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_substituicao_decidir(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_disponibilidade_dia(uuid, uuid, date) TO authenticated, service_role;