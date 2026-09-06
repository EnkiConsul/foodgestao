CREATE OR REPLACE FUNCTION public.dp_cancelar_troca(_troca_id uuid, _motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  t public.dp_trocas%ROWTYPE;
  v_cancelada public.dp_folgas_canceladas%ROWTYPE;
  v_folga_solicitante public.dp_folgas%ROWTYPE;
  v_restaurada uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _motivo IS NULL OR length(btrim(_motivo)) < 3 THEN
    RAISE EXCEPTION 'Justificativa obrigatória' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO t FROM public.dp_trocas WHERE id = _troca_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Troca não encontrada' USING ERRCODE = '22023'; END IF;

  IF NOT (private.is_company_admin_or_owner(_uid, t.company_id)
          OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF t.status <> 'aprovada' THEN
    RAISE EXCEPTION 'Somente trocas aprovadas podem ser canceladas' USING ERRCODE = 'check_violation';
  END IF;

  -- Cancela a folga criada para o solicitante pela troca
  SELECT * INTO v_folga_solicitante
    FROM public.dp_folgas
   WHERE company_id = t.company_id
     AND colaborador_id = t.solicitante_id
     AND data = t.data_original
     AND origem = 'troca'
     AND status <> 'cancelada'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.dp_folgas
       SET status = 'cancelada', updated_at = now()
     WHERE id = v_folga_solicitante.id;

    INSERT INTO public.dp_folgas_canceladas
      (company_id, colaborador_id, folga_id, data, motivo, origem_cancelamento, cancelado_por)
    VALUES
      (t.company_id, t.solicitante_id, v_folga_solicitante.id, t.data_original,
       'Troca cancelada pelo gestor (id=' || t.id || '): ' || btrim(_motivo), 'troca', _uid);
  END IF;

  -- Restaura a folga do destinatário cancelada por esta troca
  SELECT * INTO v_cancelada
    FROM public.dp_folgas_canceladas
   WHERE company_id = t.company_id
     AND colaborador_id = t.destino_id
     AND data = t.data_original
     AND origem_cancelamento = 'troca'
     AND motivo LIKE 'Troca aprovada (id=' || t.id || ')%'
   ORDER BY created_at DESC
   LIMIT 1;

  IF FOUND AND v_cancelada.folga_id IS NOT NULL THEN
    UPDATE public.dp_folgas
       SET status = 'agendada', updated_at = now()
     WHERE id = v_cancelada.folga_id
       AND status = 'cancelada'
    RETURNING id INTO v_restaurada;
  END IF;

  UPDATE public.dp_trocas
     SET status = 'cancelada',
         gestor_resposta = 'cancelada: ' || btrim(_motivo),
         gestor_respondido_em = now(),
         gestor_id = _uid,
         updated_at = now()
   WHERE id = t.id;

  RETURN jsonb_build_object(
    'troca_id', t.id,
    'status', 'cancelada',
    'folga_cancelada_id', v_folga_solicitante.id,
    'folga_restaurada_id', v_restaurada
  );
END
$$;

REVOKE ALL ON FUNCTION public.dp_cancelar_troca(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_cancelar_troca(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_notif_troca()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_solic uuid;
  v_dest uuid;
  v_titulo text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.dp_notificacoes (company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
    VALUES (NEW.company_id, 'troca_nova', 'Nova solicitação de troca',
            'Data original: ' || NEW.data_original::text,
            'dp_trocas', NEW.id, true);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.colega_resposta IS DISTINCT FROM OLD.colega_resposta AND NEW.colega_resposta IS NOT NULL THEN
      SELECT c.user_id INTO v_solic FROM public.dp_colaboradores c WHERE c.id = NEW.solicitante_id;
      IF v_solic IS NOT NULL THEN
        INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, ref_table, ref_id)
        VALUES (NEW.company_id, v_solic, NEW.solicitante_id, 'troca_resposta_colega',
                'Colega respondeu à sua troca', 'dp_trocas', NEW.id);
      END IF;
    END IF;

    IF NEW.gestor_resposta IS DISTINCT FROM OLD.gestor_resposta AND NEW.gestor_resposta IS NOT NULL THEN
      v_titulo := CASE
        WHEN NEW.status = 'cancelada' THEN 'Gestor cancelou a troca'
        WHEN NEW.status = 'recusada' THEN 'Gestor recusou a troca'
        ELSE 'Gestor respondeu à troca'
      END;

      SELECT c.user_id INTO v_solic FROM public.dp_colaboradores c WHERE c.id = NEW.solicitante_id;
      SELECT c.user_id INTO v_dest FROM public.dp_colaboradores c WHERE c.id = NEW.destino_id;

      IF v_solic IS NOT NULL THEN
        INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id)
        VALUES (NEW.company_id, v_solic, NEW.solicitante_id, 'troca_resposta_gestor',
                v_titulo, NEW.gestor_resposta, 'dp_trocas', NEW.id);
      END IF;

      IF v_dest IS NOT NULL AND v_dest IS DISTINCT FROM v_solic THEN
        INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id)
        VALUES (NEW.company_id, v_dest, NEW.destino_id, 'troca_resposta_gestor',
                v_titulo, NEW.gestor_resposta, 'dp_trocas', NEW.id);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END
$$;