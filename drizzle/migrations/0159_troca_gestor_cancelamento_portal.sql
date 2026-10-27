CREATE OR REPLACE FUNCTION public.dp_trocas_exige_assinatura_solicitante()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_req public.dp_trocas%ROWTYPE; v_old public.dp_trocas%ROWTYPE; v_eu uuid;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.origem_registro IS DISTINCT FROM OLD.origem_registro OR NEW.notificar_portal IS DISTINCT FROM OLD.notificar_portal) THEN
  RAISE EXCEPTION 'FORBIDDEN: origem da troca imutável';
 END IF;
 IF NEW.origem_registro='gestor' THEN
  IF NEW.solicitante_assinatura IS NOT NULL OR NEW.destino_assinatura IS NOT NULL OR NEW.colega_resposta IS NOT NULL THEN
   RAISE EXCEPTION 'INVALID_INPUT: ajuste administrativo não representa aceite ou assinatura';
  END IF;
  IF TG_OP='INSERT' THEN
   IF NOT (private.is_company_admin_or_owner(auth.uid(),NEW.company_id) OR public.is_super_admin(auth.uid()))
      OR NEW.gestor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'FORBIDDEN: autorização do gestor obrigatória'; END IF;
   IF NEW.status::text<>'pendente_gestor' THEN RAISE EXCEPTION 'INVALID_INPUT: efetivação administrativa deve usar rotina oficial'; END IF;
   RETURN NEW;
  END IF;
  IF private.is_company_admin_or_owner(auth.uid(),NEW.company_id) OR public.is_super_admin(auth.uid()) THEN RETURN NEW; END IF;
  v_req := NEW; v_old := OLD;
  v_req.cancelamento_solicitado_em := OLD.cancelamento_solicitado_em;
  v_req.cancelamento_solicitado_por := OLD.cancelamento_solicitado_por;
  v_req.cancelamento_motivo := OLD.cancelamento_motivo;
  v_req.updated_at := OLD.updated_at;
  IF v_req IS NOT DISTINCT FROM v_old
     AND OLD.status::text='aprovada'
     AND OLD.cancelamento_solicitado_em IS NULL AND NEW.cancelamento_solicitado_em IS NOT NULL
     AND NEW.cancelamento_solicitado_por IN (OLD.solicitante_id, OLD.destino_id) THEN
   SELECT c.id INTO v_eu FROM public.dp_colaboradores c
    WHERE c.user_id=auth.uid() AND c.company_id=NEW.company_id AND c.id=NEW.cancelamento_solicitado_por;
   IF v_eu IS NOT NULL THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'FORBIDDEN: autorização do gestor obrigatória';
 END IF;
 IF TG_OP='UPDATE' AND NEW.created_at >= '2026-10-04 22:30:00+00' AND NEW.solicitante_assinatura IS NULL
     AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text NOT IN ('cancelada','expirada','recusada','pendente_colega') THEN
  RAISE EXCEPTION 'troca_sem_assinatura_solicitante';
 END IF;
 RETURN NEW;
END $$;