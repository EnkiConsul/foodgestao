-- Adiantamento salarial: antecedência mínima por unidade (só para o pedido do
-- colaborador), pedido pelo portal com termo assinado, aviso ao gestor e
-- relação da competência para a contabilidade.

ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'adiantamento_solicitacao';
ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'adiantamento_relacao';

-- 1. Regras da unidade --------------------------------------------------------
ALTER TABLE public.dp_unidades
  ADD COLUMN IF NOT EXISTS adiantamento_antecedencia_dias smallint NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS adiantamento_aviso text NOT NULL DEFAULT 'alteracoes';

DO $$ BEGIN
  ALTER TABLE public.dp_unidades
    ADD CONSTRAINT dp_unidades_adiant_antecedencia_chk CHECK (adiantamento_antecedencia_dias BETWEEN 1 AND 20);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.dp_unidades
    ADD CONSTRAINT dp_unidades_adiant_aviso_chk CHECK (adiantamento_aviso IN ('alteracoes', 'relacao_mensal'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.dp_unidades.adiantamento_antecedencia_dias IS
  'Dias antes do pagamento do adiantamento em que o pedido do colaborador pelo portal ainda vale para o mês. O gestor não tem antecedência.';
COMMENT ON COLUMN public.dp_unidades.adiantamento_aviso IS
  'alteracoes = aviso a cada adesão/cancelamento pelo portal; relacao_mensal = também avisa com a relação completa quando o prazo do mês fecha.';

-- 2. Termo da solicitação ------------------------------------------------------
ALTER TABLE public.dp_adiantamento_solicitacoes
  ADD COLUMN IF NOT EXISTS termo_modo text,
  ADD COLUMN IF NOT EXISTS termo_documento_id uuid REFERENCES public.dp_documentos(id) ON DELETE SET NULL;
DO $$ BEGIN
  ALTER TABLE public.dp_adiantamento_solicitacoes
    ADD CONSTRAINT dp_adiant_sol_termo_modo_chk CHECK (termo_modo IS NULL OR termo_modo IN ('documento', 'papel_existente'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_dp_adiant_sol_termo_doc ON public.dp_adiantamento_solicitacoes (termo_documento_id) WHERE termo_documento_id IS NOT NULL;

COMMENT ON COLUMN public.dp_adiantamento_solicitacoes.termo_modo IS
  'documento = termo de opção emitido na pasta do colaborador (termo_documento_id); papel_existente = gestor declarou ter o termo assinado em papel.';

-- 3. Regras puras de data ------------------------------------------------------
CREATE OR REPLACE FUNCTION private.dp_adiantamento_pagamento_em(p_comp text, p_dia integer)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT LEAST(
    to_date(p_comp || '-01', 'YYYY-MM-DD') + (LEAST(GREATEST(COALESCE(p_dia, 15), 1), 31) - 1),
    (to_date(p_comp || '-01', 'YYYY-MM-DD') + INTERVAL '1 month - 1 day')::date
  )
$$;

CREATE OR REPLACE FUNCTION private.dp_adiantamento_comp_somar(p_comp text, p_meses integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT to_char(to_date(p_comp || '-01', 'YYYY-MM-DD') + make_interval(months => p_meses), 'YYYY-MM')
$$;

-- Pedido do colaborador: vale na primeira competência cujo prazo
-- (pagamento - antecedência) ainda não passou.
CREATE OR REPLACE FUNCTION private.dp_adiantamento_competencia_portal(p_data date, p_dia integer, p_antecedencia integer)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_comp text := to_char(p_data, 'YYYY-MM');
  i int;
BEGIN
  FOR i IN 1..3 LOOP
    IF p_data <= private.dp_adiantamento_pagamento_em(v_comp, p_dia) - GREATEST(COALESCE(p_antecedencia, 5), 0) THEN
      RETURN v_comp;
    END IF;
    v_comp := private.dp_adiantamento_comp_somar(v_comp, 1);
  END LOOP;
  RETURN v_comp;
END $$;

-- Estado na competência: última solicitação que já vale. Antes da primeira
-- solicitação, o estado é o oposto do que ela pediu (pedir cancelamento prova
-- que estava ativo); sem nenhuma solicitação, vale o cadastro.
CREATE OR REPLACE FUNCTION private.dp_adiantamento_optante_em(p_colaborador uuid, p_comp text, p_fallback boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT s.tipo = 'ativar' FROM public.dp_adiantamento_solicitacoes s
      WHERE s.colaborador_id = p_colaborador AND s.competencia_efeito <= p_comp
      ORDER BY s.competencia_efeito DESC, s.created_at DESC LIMIT 1),
    (SELECT s.tipo = 'cancelar' FROM public.dp_adiantamento_solicitacoes s
      WHERE s.colaborador_id = p_colaborador
      ORDER BY s.competencia_efeito ASC, s.created_at ASC LIMIT 1),
    COALESCE(p_fallback, false)
  )
$$;

REVOKE ALL ON FUNCTION private.dp_adiantamento_pagamento_em(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_adiantamento_comp_somar(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_adiantamento_competencia_portal(date, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_adiantamento_optante_em(uuid, text, boolean) FROM PUBLIC, anon, authenticated;

-- Quem pode ter adiantamento: mensalista, fora do intermitente e do sócio.
CREATE OR REPLACE FUNCTION private.dp_adiantamento_vinculo_elegivel(p_regime text, p_forma text, p_vinculo text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE(p_forma, 'mensalista') = 'mensalista'
     AND COALESCE(p_regime, '') <> 'intermitente'
     AND lower(COALESCE(p_vinculo, '')) NOT IN ('socio', 'sócio')
$$;
REVOKE ALL ON FUNCTION private.dp_adiantamento_vinculo_elegivel(text, text, text) FROM PUBLIC, anon, authenticated;

-- 4. Competência do pedido do portal: antecedência da unidade (antes: carência fixa de 30 dias).
CREATE OR REPLACE FUNCTION public.dp_adiantamento_solicitacao_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_dia int;
  v_ant int;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NEW.origem = 'portal'
     AND (TG_OP = 'INSERT' OR NEW.data_solicitacao IS DISTINCT FROM OLD.data_solicitacao) THEN
    IF NEW.data_solicitacao < v_hoje THEN
      RAISE EXCEPTION 'No portal, a data da solicitacao nao pode ser retroativa.';
    END IF;
    SELECT u.dia_adiantamento, u.adiantamento_antecedencia_dias INTO v_dia, v_ant
      FROM public.dp_colaboradores c
      LEFT JOIN public.dp_unidades u ON u.id = c.unidade_id
     WHERE c.id = NEW.colaborador_id;
    NEW.competencia_efeito := private.dp_adiantamento_competencia_portal(NEW.data_solicitacao, v_dia, v_ant);
  END IF;
  RETURN NEW;
END;
$function$;

-- 5. Registro do gestor (sem antecedência), agora com o termo de opção ----------
DROP FUNCTION IF EXISTS public.dp_adiantamento_registrar(uuid, text, date, text);
CREATE FUNCTION public.dp_adiantamento_registrar(
  p_colaborador uuid, p_tipo text, p_data date, p_observacao text DEFAULT NULL,
  p_termo_modo text DEFAULT NULL, p_termo_documento_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_id uuid;
  v_competencia text;
  v_dia int;
  v_modo text := NULLIF(btrim(COALESCE(p_termo_modo, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_colaborador IS NULL OR p_tipo IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe o colaborador, o tipo e a data.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo NOT IN ('ativar', 'cancelar') THEN
    RAISE EXCEPTION 'INVALID_INPUT: tipo inválido.' USING ERRCODE = '22023';
  END IF;
  IF v_modo IS NULL AND p_termo_documento_id IS NOT NULL THEN v_modo := 'documento'; END IF;
  IF v_modo IS NOT NULL AND p_tipo <> 'ativar' THEN
    RAISE EXCEPTION 'INVALID_INPUT: o termo de opção só acompanha a ativação.' USING ERRCODE = '22023';
  END IF;
  IF v_modo IS NOT NULL AND v_modo NOT IN ('documento', 'papel_existente') THEN
    RAISE EXCEPTION 'INVALID_INPUT: forma do termo inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT c.company_id, u.dia_adiantamento INTO v_company, v_dia
    FROM public.dp_colaboradores c
    LEFT JOIN public.dp_unidades u ON u.id = c.unidade_id
   WHERE c.id = p_colaborador;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NAO_ENCONTRADO: colaborador não encontrado.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_company_admin_or_owner(v_uid, v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas o gestor pode registrar adiantamento salarial.' USING ERRCODE = '42501';
  END IF;
  IF v_modo = 'documento' AND NOT EXISTS (
    SELECT 1 FROM public.dp_documentos d
     WHERE d.id = p_termo_documento_id AND d.company_id = v_company
       AND d.colaborador_id = p_colaborador AND d.tipo::text = 'termos' AND d.arquivado_em IS NULL
  ) THEN
    RAISE EXCEPTION 'ADIANTAMENTO_TERMO_INVALIDO: o termo indicado não é deste colaborador.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_colaborador::text || p_tipo || p_data::text, 0));

  SELECT s.id, s.competencia_efeito INTO v_id, v_competencia
    FROM public.dp_adiantamento_solicitacoes s
   WHERE s.colaborador_id = p_colaborador AND s.tipo = p_tipo AND s.data_solicitacao = p_data
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    IF v_modo IS NOT NULL THEN
      UPDATE public.dp_adiantamento_solicitacoes
         SET termo_modo = v_modo,
             termo_documento_id = CASE WHEN v_modo = 'documento' THEN p_termo_documento_id ELSE NULL END
       WHERE id = v_id AND termo_modo IS NULL;
    END IF;
    RETURN jsonb_build_object('ok', true, 'solicitacao_id', v_id, 'competencia_efeito', v_competencia,
                              'origem', 'gestor', 'duplicada', true);
  END IF;

  -- Gestor: sem antecedência. Antes do dia do pagamento vale no mês; no dia ou depois, no seguinte.
  v_competencia := CASE
    WHEN p_data >= private.dp_adiantamento_pagamento_em(to_char(p_data, 'YYYY-MM'), v_dia)
      THEN private.dp_adiantamento_comp_somar(to_char(p_data, 'YYYY-MM'), 1)
    ELSE to_char(p_data, 'YYYY-MM')
  END;

  INSERT INTO public.dp_adiantamento_solicitacoes
    (company_id, colaborador_id, tipo, data_solicitacao, competencia_efeito, origem, observacao, criado_por,
     termo_modo, termo_documento_id)
  VALUES
    (v_company, p_colaborador, p_tipo, p_data, v_competencia, 'gestor',
     NULLIF(btrim(COALESCE(p_observacao, '')), ''), v_uid,
     v_modo, CASE WHEN v_modo = 'documento' THEN p_termo_documento_id ELSE NULL END)
  RETURNING id, competencia_efeito INTO v_id, v_competencia;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', v_id, 'competencia_efeito', v_competencia,
                            'origem', 'gestor', 'duplicada', false);
END;
$function$;
REVOKE ALL ON FUNCTION public.dp_adiantamento_registrar(uuid, text, date, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_adiantamento_registrar(uuid, text, date, text, text, uuid) TO authenticated, service_role;

-- 6. Portal: situação do próprio colaborador -----------------------------------
CREATE OR REPLACE FUNCTION public.dp_portal_meu_adiantamento()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_id uuid := public.dp_meu_colaborador();
  c public.dp_colaboradores;
  u public.dp_unidades;
  v_empresa text;
  v_cnpj text;
  v_cargo text;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_comp_atual text;
  v_comp_pedido text;
  v_pag_atual date;
  v_pag_pedido date;
  v_motivo text;
BEGIN
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('disponivel', false, 'motivo', 'sem_vinculo');
  END IF;
  SELECT * INTO c FROM public.dp_colaboradores WHERE id = v_id;
  SELECT * INTO u FROM public.dp_unidades WHERE id = c.unidade_id;
  v_motivo := CASE
    WHEN NOT COALESCE(c.ativo, false) OR c.deleted_at IS NOT NULL THEN 'vinculo_inativo'
    WHEN NOT private.dp_adiantamento_vinculo_elegivel(c.regime::text, c.forma_pagamento::text, c.vinculo_label) THEN 'vinculo_sem_adiantamento'
    WHEN u.id IS NULL OR NOT COALESCE(u.tem_adiantamento, false) OR u.dia_adiantamento IS NULL THEN 'unidade_sem_adiantamento'
    ELSE NULL END;
  IF v_motivo IS NOT NULL THEN
    RETURN jsonb_build_object('disponivel', false, 'motivo', v_motivo);
  END IF;

  SELECT co.name, co.cnpj INTO v_empresa, v_cnpj FROM public.companies co WHERE co.id = c.company_id;
  SELECT cg.nome INTO v_cargo FROM public.dp_cargos cg WHERE cg.id = c.cargo_id;

  v_comp_atual := to_char(v_hoje, 'YYYY-MM');
  IF v_hoje > private.dp_adiantamento_pagamento_em(v_comp_atual, u.dia_adiantamento) THEN
    v_comp_atual := private.dp_adiantamento_comp_somar(v_comp_atual, 1);
  END IF;
  v_pag_atual := private.dp_adiantamento_pagamento_em(v_comp_atual, u.dia_adiantamento);
  v_comp_pedido := private.dp_adiantamento_competencia_portal(v_hoje, u.dia_adiantamento, u.adiantamento_antecedencia_dias);
  v_pag_pedido := private.dp_adiantamento_pagamento_em(v_comp_pedido, u.dia_adiantamento);

  RETURN jsonb_build_object(
    'disponivel', true,
    'colaborador_id', c.id,
    'company_id', c.company_id,
    'nome', c.nome,
    'cpf', c.cpf,
    'cargo', COALESCE(v_cargo, c.cargo),
    'empresa', v_empresa,
    'cnpj', v_cnpj,
    'unidade', u.nome,
    'dia', u.dia_adiantamento,
    'antecedencia', u.adiantamento_antecedencia_dias,
    'hoje', v_hoje,
    'competencia_atual', v_comp_atual,
    'pagamento_atual', v_pag_atual,
    'limite_atual', v_pag_atual - u.adiantamento_antecedencia_dias,
    'ativo_atual', private.dp_adiantamento_optante_em(c.id, v_comp_atual, c.optante_adiantamento),
    'competencia_pedido', v_comp_pedido,
    'pagamento_pedido', v_pag_pedido,
    'limite_pedido', v_pag_pedido - u.adiantamento_antecedencia_dias,
    'ativo_pedido', private.dp_adiantamento_optante_em(c.id, v_comp_pedido, c.optante_adiantamento),
    'historico', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'tipo', s.tipo, 'data_solicitacao', s.data_solicitacao,
        'competencia_efeito', s.competencia_efeito, 'origem', s.origem
      ) ORDER BY s.created_at DESC)
      FROM (SELECT * FROM public.dp_adiantamento_solicitacoes x
             WHERE x.colaborador_id = c.id ORDER BY x.created_at DESC LIMIT 6) s
    ), '[]'::jsonb)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.dp_portal_meu_adiantamento() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_portal_meu_adiantamento() TO authenticated, service_role;

-- 7. Portal: termo de opção (registrado antes da leitura/assinatura) -----------
CREATE OR REPLACE FUNCTION public.dp_adiantamento_termo_preparar(p_file_path text, p_file_size bigint DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_id uuid := public.dp_meu_colaborador();
  v_info jsonb;
  c public.dp_colaboradores;
  v_doc public.dp_documentos;
  v_titulo constant text := 'Termo de Opção pelo Adiantamento Salarial';
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso do colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;
  v_info := public.dp_portal_meu_adiantamento();
  IF NOT COALESCE((v_info->>'disponivel')::boolean, false) THEN
    RAISE EXCEPTION 'ADIANTAMENTO_INDISPONIVEL: sua unidade ou seu vínculo não tem adiantamento salarial.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE((v_info->>'ativo_pedido')::boolean, false) THEN
    RAISE EXCEPTION 'ADIANTAMENTO_JA_ATIVO: seu adiantamento já está ativo.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO c FROM public.dp_colaboradores WHERE id = v_id;
  IF p_file_path IS NULL OR p_file_path NOT LIKE (c.company_id::text || '/' || c.id::text || '/%') THEN
    RAISE EXCEPTION 'DOC_ARQUIVO_FORA_DA_EMPRESA' USING ERRCODE = '22023';
  END IF;

  -- Vias anteriores que ficaram sem assinatura (pedido abandonado) saem da pasta.
  UPDATE public.dp_documentos d
     SET arquivado_em = now(), arquivado_por = auth.uid(),
         arquivamento_motivo = 'Termo de adiantamento não assinado, substituído por nova via.'
   WHERE d.colaborador_id = v_id AND d.titulo = v_titulo AND d.arquivado_em IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.dp_documento_aceites a WHERE a.documento_id = d.id)
     AND NOT EXISTS (SELECT 1 FROM public.dp_adiantamento_solicitacoes s WHERE s.termo_documento_id = d.id);

  INSERT INTO public.dp_documentos (
    company_id, colaborador_id, tipo, titulo, descricao, file_path, file_name, file_size, mime_type,
    referencia_data, exige_aceite, assinatura_fisica, uploaded_by, submetido_por_colaborador, aprovacao_status
  ) VALUES (
    c.company_id, v_id, 'termos', v_titulo,
    'Versão v1. Pedido feito pelo próprio colaborador no portal, com leitura e assinatura eletrônica.',
    p_file_path, 'termo-opcao-adiantamento.pdf', p_file_size, 'application/pdf',
    (now() AT TIME ZONE 'America/Sao_Paulo')::date, true, false, auth.uid(), false, 'aprovado'
  ) RETURNING * INTO v_doc;

  PERFORM private.dp_doc_evento(v_doc, 'document_created', NULL, NULL, p_file_path);
  -- O colaborador está assinando agora: o aviso de "novo documento" seria ruído.
  DELETE FROM public.dp_notificacoes WHERE chave = 'documento_novo:' || v_doc.id::text;
  RETURN v_doc.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.dp_adiantamento_termo_preparar(text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_adiantamento_termo_preparar(text, bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_adiantamento_termo_descartar(p_documento uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_id uuid := public.dp_meu_colaborador();
  v_n int;
BEGIN
  IF v_id IS NULL OR p_documento IS NULL THEN RETURN false; END IF;
  UPDATE public.dp_documentos d
     SET arquivado_em = now(), arquivado_por = auth.uid(),
         arquivamento_motivo = 'Pedido de adiantamento não concluído pelo colaborador.'
   WHERE d.id = p_documento AND d.colaborador_id = v_id
     AND d.titulo = 'Termo de Opção pelo Adiantamento Salarial' AND d.arquivado_em IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.dp_documento_aceites a WHERE a.documento_id = d.id)
     AND NOT EXISTS (SELECT 1 FROM public.dp_adiantamento_solicitacoes s WHERE s.termo_documento_id = d.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$function$;
REVOKE ALL ON FUNCTION public.dp_adiantamento_termo_descartar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_adiantamento_termo_descartar(uuid) TO authenticated, service_role;

-- 8. Portal: pedido de ativação (com termo assinado) ou cancelamento ------------
CREATE OR REPLACE FUNCTION public.dp_adiantamento_solicitar_portal(p_tipo text, p_documento uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_id uuid := public.dp_meu_colaborador();
  v_info jsonb;
  c public.dp_colaboradores;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_sol uuid;
  v_comp text;
  v_meses constant text[] := ARRAY['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  v_rotulo text;
  v_user uuid;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso do colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF p_tipo NOT IN ('ativar', 'cancelar') THEN
    RAISE EXCEPTION 'INVALID_INPUT: tipo inválido.' USING ERRCODE = '22023';
  END IF;
  v_info := public.dp_portal_meu_adiantamento();
  IF NOT COALESCE((v_info->>'disponivel')::boolean, false) THEN
    RAISE EXCEPTION 'ADIANTAMENTO_INDISPONIVEL: sua unidade ou seu vínculo não tem adiantamento salarial.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.dp_colaboradores WHERE id = v_id;

  PERFORM pg_advisory_xact_lock(hashtextextended('dp_adiantamento_portal:' || v_id::text, 0));

  IF p_tipo = 'ativar' AND COALESCE((v_info->>'ativo_pedido')::boolean, false) THEN
    RAISE EXCEPTION 'ADIANTAMENTO_JA_ATIVO: seu adiantamento já está ativo.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo = 'cancelar' AND NOT COALESCE((v_info->>'ativo_pedido')::boolean, false) THEN
    RAISE EXCEPTION 'ADIANTAMENTO_JA_INATIVO: seu adiantamento já está suspenso.' USING ERRCODE = '22023';
  END IF;

  -- A ativação só vale com o termo de opção assinado pelo próprio colaborador (CLT, art. 462).
  IF p_tipo = 'ativar' AND NOT EXISTS (
    SELECT 1 FROM public.dp_documentos d
      JOIN public.dp_documento_aceites a ON a.documento_id = d.id
     WHERE d.id = p_documento AND d.colaborador_id = v_id AND d.company_id = c.company_id
       AND d.titulo = 'Termo de Opção pelo Adiantamento Salarial' AND d.arquivado_em IS NULL
  ) THEN
    RAISE EXCEPTION 'ADIANTAMENTO_TERMO_PENDENTE: assine o termo de opção para concluir o pedido.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.dp_adiantamento_solicitacoes
    (company_id, colaborador_id, tipo, data_solicitacao, competencia_efeito, origem, observacao, criado_por,
     termo_modo, termo_documento_id)
  VALUES
    (c.company_id, v_id, p_tipo, v_hoje, to_char(v_hoje, 'YYYY-MM'), 'portal',
     CASE WHEN p_tipo = 'ativar' THEN 'Pedido pelo portal com termo de opção assinado.'
          ELSE 'Suspensão pedida pelo portal.' END,
     auth.uid(),
     CASE WHEN p_tipo = 'ativar' THEN 'documento' END,
     CASE WHEN p_tipo = 'ativar' THEN p_documento END)
  RETURNING id, competencia_efeito INTO v_sol, v_comp;

  v_rotulo := v_meses[substr(v_comp, 6, 2)::int] || '/' || substr(v_comp, 1, 4);
  FOR v_user IN
    SELECT DISTINCT cm.user_id FROM public.company_members cm
     WHERE cm.company_id = c.company_id AND cm.role IN ('admin', 'owner') AND cm.user_id IS NOT NULL
  LOOP
    INSERT INTO public.dp_notificacoes (company_id, user_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave)
    VALUES (
      c.company_id, v_user, 'adiantamento_solicitacao',
      CASE WHEN p_tipo = 'ativar' THEN 'Adiantamento salarial: nova adesão' ELSE 'Adiantamento salarial: suspensão' END,
      c.nome || CASE WHEN p_tipo = 'ativar'
                     THEN ' pediu para receber o adiantamento a partir de ' || v_rotulo || ' e assinou o termo de opção.'
                     ELSE ' pediu para suspender o adiantamento a partir de ' || v_rotulo || '.' END
        || ' Toque para ver a relação do mês.',
      'dp_adiantamento_solicitacoes', v_sol, true,
      'adiantamento_solicitacao:' || v_sol::text || ':' || v_user::text
    ) ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', v_sol, 'competencia_efeito', v_comp);
END;
$function$;
REVOKE ALL ON FUNCTION public.dp_adiantamento_solicitar_portal(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_adiantamento_solicitar_portal(text, uuid) TO authenticated, service_role;

-- 9. Relação da competência (gestor) --------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_adiantamento_relacao(p_company uuid, p_competencia text, p_unidade uuid DEFAULT NULL)
RETURNS TABLE (
  colaborador_id uuid, nome text, cargo text, unidade_id uuid, unidade_nome text, dia_adiantamento smallint,
  pagamento_em date, regime text, situacao text, mudanca_data date, mudanca_origem text,
  termo_situacao text, termo_documento_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
#variable_conflict use_column
DECLARE
  v_ant text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF p_company IS NULL OR p_competencia IS NULL OR p_competencia !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'INVALID_INPUT: competência inválida.' USING ERRCODE = '22023';
  END IF;
  IF NOT (private.is_company_admin_or_owner(auth.uid(), p_company)
          OR public.tem_permissao(p_company, 'dp.colaboradores', 'consulta')) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  v_ant := private.dp_adiantamento_comp_somar(p_competencia, -1);

  RETURN QUERY
  WITH base AS (
    SELECT c.id AS cid, c.nome AS cnome, COALESCE(cg.nome, c.cargo) AS ccargo,
           u.id AS uid, u.nome AS unome, u.dia_adiantamento AS udia, c.regime::text AS cregime,
           c.data_admissao AS adm, c.data_desligamento AS desl,
           private.dp_adiantamento_pagamento_em(p_competencia, u.dia_adiantamento) AS pag,
           private.dp_adiantamento_optante_em(c.id, p_competencia, c.optante_adiantamento) AS ativo,
           private.dp_adiantamento_optante_em(c.id, v_ant, c.optante_adiantamento) AS ativo_antes
      FROM public.dp_colaboradores c
      JOIN public.dp_unidades u ON u.id = c.unidade_id
      LEFT JOIN public.dp_cargos cg ON cg.id = c.cargo_id
     WHERE c.company_id = p_company
       AND u.company_id = p_company
       AND c.deleted_at IS NULL
       AND (p_unidade IS NULL OR u.id = p_unidade)
       AND COALESCE(u.tem_adiantamento, false) AND u.dia_adiantamento IS NOT NULL
       AND private.dp_adiantamento_vinculo_elegivel(c.regime::text, c.forma_pagamento::text, c.vinculo_label)
       AND NOT (COALESCE(c.ativo, false) = false AND c.data_desligamento IS NULL)
  ), elig AS (
    SELECT * FROM base b
     WHERE (b.adm IS NULL OR b.adm <= b.pag)
       AND (b.desl IS NULL OR b.desl >= b.pag)
  )
  SELECT e.cid, e.cnome, e.ccargo, e.uid, e.unome, e.udia::smallint, e.pag, e.cregime,
         CASE WHEN e.ativo AND NOT e.ativo_antes AND m.sid IS NOT NULL THEN 'nova_adesao'
              WHEN e.ativo THEN 'optante'
              ELSE 'cancelado' END,
         m.sdata, m.sorigem,
         CASE WHEN NOT e.ativo THEN NULL
              WHEN t.tmodo = 'papel_existente' THEN 'papel_existente'
              WHEN t.tdoc IS NULL OR d.id IS NULL OR d.arquivado_em IS NOT NULL THEN 'sem_termo'
              WHEN EXISTS (SELECT 1 FROM public.dp_documento_aceites a WHERE a.documento_id = d.id) THEN 'assinado'
              WHEN d.via_assinada_path IS NOT NULL THEN 'assinado_papel'
              WHEN COALESCE(d.assinatura_fisica, false) THEN 'aguardando_via'
              ELSE 'aguardando_assinatura' END,
         CASE WHEN e.ativo THEN t.tdoc END
    FROM elig e
    LEFT JOIN LATERAL (
      SELECT s.id AS sid, s.data_solicitacao AS sdata, s.origem AS sorigem
        FROM public.dp_adiantamento_solicitacoes s
       WHERE s.colaborador_id = e.cid AND s.competencia_efeito = p_competencia
       ORDER BY s.created_at DESC LIMIT 1
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT s.termo_modo AS tmodo, s.termo_documento_id AS tdoc
        FROM public.dp_adiantamento_solicitacoes s
       WHERE s.colaborador_id = e.cid AND s.tipo = 'ativar' AND s.competencia_efeito <= p_competencia
       ORDER BY s.competencia_efeito DESC, s.created_at DESC LIMIT 1
    ) t ON true
    LEFT JOIN public.dp_documentos d ON d.id = t.tdoc
   WHERE e.ativo OR (e.ativo_antes AND m.sid IS NOT NULL)
   ORDER BY e.unome, e.cnome;
END;
$function$;
REVOKE ALL ON FUNCTION public.dp_adiantamento_relacao(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_adiantamento_relacao(uuid, text, uuid) TO authenticated, service_role;

-- 10. Previsão de pagamentos do portal usa a mesma leitura de estado -------------
CREATE OR REPLACE FUNCTION public.dp_portal_meus_pagamentos(_competencia text)
 RETURNS TABLE(unidade_id uuid, salario_tipo text, salario_dia smallint, salario_rotulo text, adiantamento_dia smallint, va_dia smallint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT c.*
    FROM public.dp_colaboradores c
    WHERE c.id = public.dp_meu_colaborador()
      AND c.ativo = true
      AND c.deleted_at IS NULL
      AND _competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'
  ),
  cfg_unidade AS (
    SELECT d.* FROM public.dp_config_dp d JOIN me ON d.company_id = me.company_id AND d.unidade_id = me.unidade_id
    LIMIT 1
  ),
  cfg_empresa AS (
    SELECT d.* FROM public.dp_config_dp d JOIN me ON d.company_id = me.company_id AND d.unidade_id IS NULL
    LIMIT 1
  )
  SELECT
    me.unidade_id,
    CASE WHEN me.forma_pagamento = 'mensalista'
           AND me.regime::text IN ('clt', 'temporario', 'estagio')
           AND lower(coalesce(me.vinculo_label, '')) NOT IN ('socio', 'sócio')
         THEN u.pagamento_salario_tipo END,
    CASE WHEN me.forma_pagamento = 'mensalista'
           AND me.regime::text IN ('clt', 'temporario', 'estagio')
           AND lower(coalesce(me.vinculo_label, '')) NOT IN ('socio', 'sócio')
         THEN u.pagamento_salario_dia END,
    CASE WHEN me.regime::text = 'estagio' THEN 'Bolsa-estágio' ELSE 'Salário' END,
    CASE WHEN coalesce(u.tem_adiantamento, false)
           AND u.dia_adiantamento IS NOT NULL
           AND lower(coalesce(me.vinculo_label, '')) NOT IN ('socio', 'sócio')
           AND private.dp_adiantamento_optante_em(me.id, _competencia, me.optante_adiantamento)
         THEN u.dia_adiantamento END,
    CASE WHEN coalesce(me.vale_alimentacao, false)
           AND coalesce((SELECT ce.va_ativo FROM cfg_empresa ce), true)
         THEN coalesce(
           me.vale_alimentacao_dia_pagamento,
           CASE WHEN EXISTS (SELECT 1 FROM cfg_unidade)
                THEN (SELECT cu.va_dia_pagamento FROM cfg_unidade cu)
                ELSE (SELECT ce.va_dia_pagamento FROM cfg_empresa ce) END
         )::smallint END
  FROM me
  LEFT JOIN public.dp_unidades u ON u.id = me.unidade_id
$function$;

-- 11. Aviso mensal com a relação completa (unidades que escolheram) --------------
CREATE OR REPLACE FUNCTION private.dp_adiantamento_relacao_avisos()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_meses constant text[] := ARRAY['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  r record;
  k int;
  v_comp text;
  v_pag date;
  v_lim date;
  v_qtd int;
  v_user uuid;
  v_total int := 0;
  v_n int;
BEGIN
  FOR r IN
    SELECT u.id, u.company_id, u.nome, u.dia_adiantamento, u.adiantamento_antecedencia_dias AS ant
      FROM public.dp_unidades u
     WHERE COALESCE(u.ativo, true) AND COALESCE(u.tem_adiantamento, false)
       AND u.dia_adiantamento IS NOT NULL AND u.adiantamento_aviso = 'relacao_mensal'
  LOOP
    FOR k IN 0..1 LOOP
      v_comp := private.dp_adiantamento_comp_somar(to_char(v_hoje, 'YYYY-MM'), k);
      v_pag := private.dp_adiantamento_pagamento_em(v_comp, r.dia_adiantamento);
      v_lim := v_pag - r.ant;
      CONTINUE WHEN NOT (v_hoje > v_lim AND v_hoje <= v_pag);

      SELECT count(*) INTO v_qtd
        FROM public.dp_colaboradores c
       WHERE c.unidade_id = r.id AND c.deleted_at IS NULL AND COALESCE(c.ativo, false)
         AND private.dp_adiantamento_vinculo_elegivel(c.regime::text, c.forma_pagamento::text, c.vinculo_label)
         AND (c.data_admissao IS NULL OR c.data_admissao <= v_pag)
         AND (c.data_desligamento IS NULL OR c.data_desligamento >= v_pag)
         AND private.dp_adiantamento_optante_em(c.id, v_comp, c.optante_adiantamento);

      FOR v_user IN
        SELECT DISTINCT cm.user_id FROM public.company_members cm
         WHERE cm.company_id = r.company_id AND cm.role IN ('admin', 'owner') AND cm.user_id IS NOT NULL
      LOOP
        INSERT INTO public.dp_notificacoes (company_id, user_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave)
        VALUES (
          r.company_id, v_user, 'adiantamento_relacao',
          'Relação de adiantamento de ' || v_meses[substr(v_comp, 6, 2)::int] || '/' || substr(v_comp, 1, 4),
          r.nome || ': o prazo dos pedidos encerrou com ' || v_qtd || CASE WHEN v_qtd = 1 THEN ' optante' ELSE ' optantes' END
            || ' para o pagamento de ' || to_char(v_pag, 'DD/MM') || '. Toque para baixar a relação em PDF.',
          'dp_adiantamento_relacao', r.id, true,
          'adiantamento_relacao:' || r.id::text || ':' || v_comp || ':' || v_user::text
        ) ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_total := v_total + v_n;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN v_total;
END;
$function$;
REVOKE ALL ON FUNCTION private.dp_adiantamento_relacao_avisos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.dp_adiantamento_relacao_avisos() TO service_role;

DO $$ BEGIN PERFORM cron.unschedule('dp-adiantamento-relacao-aviso'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('dp-adiantamento-relacao-aviso', '0 11 * * *', $cron$SELECT private.dp_adiantamento_relacao_avisos();$cron$);
