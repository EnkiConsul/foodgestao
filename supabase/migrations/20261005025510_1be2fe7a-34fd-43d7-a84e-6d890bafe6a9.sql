ALTER TABLE public.dp_trocas
  ADD COLUMN IF NOT EXISTS cancelamento_solicitado_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelamento_solicitado_por uuid REFERENCES public.dp_colaboradores(id),
  ADD COLUMN IF NOT EXISTS cancelamento_motivo text;

CREATE OR REPLACE FUNCTION public.dp_solicitar_cancelamento_troca(_troca_id uuid, _motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid := auth.uid();
  t public.dp_trocas%ROWTYPE;
  v_eu uuid; v_outro uuid; v_nome text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Faça login novamente para continuar.' USING ERRCODE='42501'; END IF;
  IF _motivo IS NULL OR length(btrim(_motivo)) < 10 THEN
    RAISE EXCEPTION 'Explique o motivo com pelo menos 10 caracteres.' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO t FROM public.dp_trocas WHERE id=_troca_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Troca não encontrada. Atualize a tela e tente de novo.' USING ERRCODE='22023'; END IF;
  SELECT id, nome INTO v_eu, v_nome FROM public.dp_colaboradores
   WHERE user_id=_uid AND company_id=t.company_id AND id IN (t.solicitante_id, t.destino_id) LIMIT 1;
  IF v_eu IS NULL THEN RAISE EXCEPTION 'Só quem participa da troca pode pedir o cancelamento.' USING ERRCODE='42501'; END IF;
  IF t.status <> 'aprovada' THEN RAISE EXCEPTION 'Só trocas aprovadas podem ter cancelamento solicitado.' USING ERRCODE='check_violation'; END IF;
  IF t.cancelamento_solicitado_em IS NOT NULL THEN RAISE EXCEPTION 'O cancelamento desta troca já foi solicitado e aguarda o gestor.' USING ERRCODE='check_violation'; END IF;
  v_outro := CASE WHEN v_eu=t.solicitante_id THEN t.destino_id ELSE t.solicitante_id END;

  UPDATE public.dp_trocas SET cancelamento_solicitado_em=now(), cancelamento_solicitado_por=v_eu,
    cancelamento_motivo=btrim(_motivo), updated_at=now() WHERE id=t.id;

  INSERT INTO public.dp_notificacoes(company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
  VALUES (t.company_id,'troca_nova','Cancelamento de troca solicitado: '||COALESCE(v_nome,'colaborador'),
    to_char(t.data_original,'DD/MM')||' ⇄ '||COALESCE(to_char(t.data_proposta,'DD/MM'),'')||' — '||btrim(_motivo),
    'dp_trocas', t.id, true);
  INSERT INTO public.dp_notificacoes(company_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
  VALUES (t.company_id, v_outro,'troca_resposta_colega', COALESCE(v_nome,'Seu colega')||' pediu o cancelamento da troca',
    to_char(t.data_original,'DD/MM')||' ⇄ '||COALESCE(to_char(t.data_proposta,'DD/MM'),'')||'. Motivo: '||btrim(_motivo)||'. Aguardando decisão do gestor.',
    'dp_trocas', t.id, false);
  RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.dp_recusar_cancelamento_troca(_troca_id uuid, _motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); t public.dp_trocas%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Faça login novamente para continuar.' USING ERRCODE='42501'; END IF;
  IF _motivo IS NULL OR length(btrim(_motivo)) < 5 THEN RAISE EXCEPTION 'Informe o motivo da recusa (mínimo 5 caracteres).' USING ERRCODE='check_violation'; END IF;
  SELECT * INTO t FROM public.dp_trocas WHERE id=_troca_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Troca não encontrada.' USING ERRCODE='22023'; END IF;
  IF NOT (private.is_company_admin_or_owner(_uid, t.company_id) OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'Só administradores podem decidir o pedido.' USING ERRCODE='42501'; END IF;
  IF t.cancelamento_solicitado_em IS NULL THEN RAISE EXCEPTION 'Não há pedido de cancelamento pendente nesta troca.' USING ERRCODE='check_violation'; END IF;
  UPDATE public.dp_trocas SET cancelamento_solicitado_em=NULL, cancelamento_solicitado_por=NULL, cancelamento_motivo=NULL, updated_at=now() WHERE id=t.id;
  INSERT INTO public.dp_notificacoes(company_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
  SELECT t.company_id, c, 'troca_resposta_gestor', 'Cancelamento da troca recusado',
    'A troca '||to_char(t.data_original,'DD/MM')||' ⇄ '||COALESCE(to_char(t.data_proposta,'DD/MM'),'')||' continua valendo. Motivo: '||btrim(_motivo),
    'dp_trocas', t.id, false
  FROM unnest(ARRAY[t.solicitante_id, t.destino_id]) c;
  RETURN jsonb_build_object('ok',true);
END $$;

REVOKE ALL ON FUNCTION public.dp_solicitar_cancelamento_troca(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_recusar_cancelamento_troca(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_solicitar_cancelamento_troca(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_recusar_cancelamento_troca(uuid,text) TO authenticated, service_role;