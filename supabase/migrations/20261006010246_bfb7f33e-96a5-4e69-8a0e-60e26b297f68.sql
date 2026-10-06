ALTER TABLE public.dp_ferias_solicitacao_detalhes
  ADD COLUMN IF NOT EXISTS termo_assinatura_imagem text,
  ADD COLUMN IF NOT EXISTS termo_assinado_em timestamptz,
  ADD COLUMN IF NOT EXISTS termo_hash text,
  ADD COLUMN IF NOT EXISTS ajuste_gestor_de jsonb;

ALTER TABLE public.dp_ferias_gozos
  ADD COLUMN IF NOT EXISTS ciencia_assinatura_imagem text,
  ADD COLUMN IF NOT EXISTS ajustado_pelo_gestor boolean NOT NULL DEFAULT false;

-- Assinatura do termo de solicitação pelo próprio colaborador (uma única vez)
CREATE OR REPLACE FUNCTION public.dp_ferias_solicitacao_assinar(_solicitacao_id uuid, _assinatura text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_det record;
BEGIN
  IF _assinatura IS NULL OR _assinatura NOT LIKE 'data:image/png;base64,%' OR length(_assinatura) > 400000 THEN
    RAISE EXCEPTION 'FERIAS_ASSINATURA_INVALIDA';
  END IF;
  SELECT d.*, c.user_id AS col_user_id INTO v_det
  FROM public.dp_ferias_solicitacao_detalhes d
  JOIN public.dp_colaboradores c ON c.id = d.colaborador_id
  WHERE d.solicitacao_id = _solicitacao_id;
  IF v_det.id IS NULL THEN RAISE EXCEPTION 'FERIAS_SOLICITACAO_NAO_ENCONTRADA'; END IF;
  IF v_det.col_user_id IS NULL OR v_det.col_user_id <> auth.uid() THEN RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO'; END IF;
  UPDATE public.dp_ferias_solicitacao_detalhes
  SET termo_assinatura_imagem = _assinatura,
      termo_assinado_em = now(),
      termo_hash = encode(extensions.digest(
        solicitacao_id::text || '|' || data_inicio || '|' || data_fim || '|' || dias_abono || '|' || adiantar_13 || '|' || _assinatura, 'sha256'), 'hex')
  WHERE id = v_det.id AND termo_assinatura_imagem IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.dp_ferias_solicitacao_assinar(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_solicitacao_assinar(uuid, text) TO authenticated;

-- Ciência assinada do aviso de férias
DROP FUNCTION IF EXISTS public.dp_ferias_registrar_ciencia(uuid);
CREATE OR REPLACE FUNCTION public.dp_ferias_registrar_ciencia(_gozo_id uuid, _assinatura text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_gozo record;
BEGIN
  SELECT g.*, c.user_id AS col_user_id INTO v_gozo
  FROM public.dp_ferias_gozos g JOIN public.dp_colaboradores c ON c.id = g.colaborador_id
  WHERE g.id = _gozo_id;
  IF v_gozo.id IS NULL THEN RAISE EXCEPTION 'FERIAS_NAO_ENCONTRADA'; END IF;
  IF v_gozo.col_user_id IS NULL OR v_gozo.col_user_id <> auth.uid() THEN RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO'; END IF;
  IF _assinatura IS NULL OR _assinatura NOT LIKE 'data:image/png;base64,%' OR length(_assinatura) > 400000 THEN
    RAISE EXCEPTION 'FERIAS_ASSINATURA_INVALIDA';
  END IF;
  UPDATE public.dp_ferias_gozos
  SET ciente_em = COALESCE(ciente_em, now()),
      ciente_por = COALESCE(ciente_por, auth.uid()),
      ciencia_assinatura_imagem = COALESCE(ciencia_assinatura_imagem, _assinatura),
      ciente_fora_prazo = CASE WHEN ciente_em IS NULL THEN aviso_fora_prazo ELSE ciente_fora_prazo END
  WHERE id = _gozo_id;
END $$;
REVOKE ALL ON FUNCTION public.dp_ferias_registrar_ciencia(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_registrar_ciencia(uuid, text) TO authenticated;

-- Aprovação com ajuste de datas pelo gestor (decisão da empresa, Art. 136 CLT)
CREATE OR REPLACE FUNCTION public.dp_ferias_aprovar_ajustado(
  _solicitacao_id uuid, _data_inicio date, _data_fim date, _motivo text,
  _justificativa text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sol record; v_det record; v_gozo uuid;
BEGIN
  SELECT * INTO v_sol FROM public.dp_solicitacoes WHERE id = _solicitacao_id FOR UPDATE;
  IF v_sol.id IS NULL OR v_sol.tipo <> 'ferias' THEN RAISE EXCEPTION 'FERIAS_SOLICITACAO_NAO_ENCONTRADA'; END IF;
  IF v_sol.status <> 'pendente' THEN RAISE EXCEPTION 'FERIAS_SOLICITACAO_JA_RESPONDIDA'; END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), v_sol.company_id) THEN RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO'; END IF;
  IF length(btrim(coalesce(_motivo,''))) < 10 THEN RAISE EXCEPTION 'FERIAS_AJUSTE_MOTIVO_OBRIGATORIO'; END IF;
  IF _data_inicio IS NULL OR _data_fim IS NULL OR _data_fim < _data_inicio THEN RAISE EXCEPTION 'FERIAS_DATAS_INVALIDAS'; END IF;
  SELECT * INTO v_det FROM public.dp_ferias_solicitacao_detalhes WHERE solicitacao_id = _solicitacao_id;
  UPDATE public.dp_ferias_solicitacao_detalhes
  SET ajuste_gestor_de = jsonb_build_object('data_inicio', v_det.data_inicio, 'data_fim', v_det.data_fim, 'motivo', btrim(_motivo)),
      data_inicio = _data_inicio, data_fim = _data_fim, dias = (_data_fim - _data_inicio + 1)::smallint
  WHERE id = v_det.id;
  v_gozo := public.dp_ferias_aprovar(_solicitacao_id, _justificativa,
    'Datas ajustadas pelo gestor: ' || btrim(_motivo));
  UPDATE public.dp_ferias_gozos SET ajustado_pelo_gestor = true WHERE id = v_gozo;
  RETURN v_gozo;
END $$;
REVOKE ALL ON FUNCTION public.dp_ferias_aprovar_ajustado(uuid, date, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_aprovar_ajustado(uuid, date, date, text, text) TO authenticated;

-- Alteração de datas após ciência: exige nova ciência assinada
CREATE OR REPLACE FUNCTION public.dp_ferias_gozo_reset_ciencia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  IF (NEW.data_inicio, NEW.data_fim) IS DISTINCT FROM (OLD.data_inicio, OLD.data_fim)
     AND OLD.ciente_em IS NOT NULL THEN
    NEW.ciente_em := NULL; NEW.ciente_por := NULL; NEW.ciencia_assinatura_imagem := NULL;
    NEW.ajustado_pelo_gestor := true;
    SELECT user_id INTO v_user FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
    IF v_user IS NOT NULL THEN
      INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, chave)
      VALUES (NEW.company_id, v_user, NEW.colaborador_id, 'ferias_aviso',
        'Suas férias foram alteradas — dê sua ciência',
        'Novo período: ' || to_char(NEW.data_inicio,'DD/MM/YYYY') || ' a ' || to_char(NEW.data_fim,'DD/MM/YYYY'),
        'dp_ferias_gozos', NEW.id, 'ferias_aviso:' || NEW.id::text || ':' || extract(epoch from now())::bigint)
      ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.dp_ferias_gozo_reset_ciencia() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_dp_ferias_gozo_reset_ciencia ON public.dp_ferias_gozos;
CREATE TRIGGER trg_dp_ferias_gozo_reset_ciencia BEFORE UPDATE ON public.dp_ferias_gozos
FOR EACH ROW EXECUTE FUNCTION public.dp_ferias_gozo_reset_ciencia();

-- Leitura do termo (solicitação ou aviso) para o colaborador dono ou gestor
CREATE OR REPLACE FUNCTION public.dp_ferias_termo_obter(_solicitacao_id uuid DEFAULT NULL, _gozo_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_col record; v_det record; v_gozo record; v_sol record; v_emp text;
BEGIN
  IF _gozo_id IS NOT NULL THEN
    SELECT * INTO v_gozo FROM public.dp_ferias_gozos WHERE id = _gozo_id;
    IF v_gozo.id IS NULL THEN RAISE EXCEPTION 'FERIAS_NAO_ENCONTRADA'; END IF;
    _solicitacao_id := COALESCE(_solicitacao_id, v_gozo.solicitacao_id);
  END IF;
  IF _solicitacao_id IS NOT NULL THEN
    SELECT * INTO v_det FROM public.dp_ferias_solicitacao_detalhes WHERE solicitacao_id = _solicitacao_id;
    SELECT * INTO v_sol FROM public.dp_solicitacoes WHERE id = _solicitacao_id;
  END IF;
  SELECT c.id, c.nome, c.cpf, c.user_id, c.company_id INTO v_col FROM public.dp_colaboradores c
  WHERE c.id = COALESCE(v_gozo.colaborador_id, v_det.colaborador_id);
  IF v_col.id IS NULL THEN RAISE EXCEPTION 'FERIAS_NAO_ENCONTRADA'; END IF;
  IF NOT (v_col.user_id = auth.uid() OR private.is_company_admin_or_owner(auth.uid(), v_col.company_id)) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;
  SELECT COALESCE(razao_social, name) INTO v_emp FROM public.companies WHERE id = v_col.company_id;
  RETURN jsonb_build_object(
    'empresa', v_emp, 'colaborador_nome', v_col.nome, 'colaborador_cpf', v_col.cpf,
    'solicitacao', CASE WHEN v_det.id IS NULL THEN NULL ELSE jsonb_build_object(
      'status', v_sol.status, 'criado_em', v_sol.created_at, 'respondido_em', v_sol.respondido_em,
      'resposta_admin', v_sol.resposta_admin,
      'data_inicio', v_det.data_inicio, 'data_fim', v_det.data_fim, 'dias', v_det.dias,
      'dias_abono', v_det.dias_abono, 'adiantar_13', v_det.adiantar_13, 'observacao', v_det.observacao,
      'ajuste_gestor_de', v_det.ajuste_gestor_de,
      'assinatura', v_det.termo_assinatura_imagem, 'assinado_em', v_det.termo_assinado_em, 'hash', v_det.termo_hash) END,
    'aviso', CASE WHEN v_gozo.id IS NULL THEN NULL ELSE jsonb_build_object(
      'data_inicio', v_gozo.data_inicio, 'data_fim', v_gozo.data_fim, 'dias_abono', v_gozo.dias_abono,
      'aviso_em', v_gozo.aviso_em, 'ajustado_pelo_gestor', v_gozo.ajustado_pelo_gestor,
      'ciente_em', v_gozo.ciente_em, 'assinatura', v_gozo.ciencia_assinatura_imagem) END);
END $$;
REVOKE ALL ON FUNCTION public.dp_ferias_termo_obter(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_termo_obter(uuid, uuid) TO authenticated;