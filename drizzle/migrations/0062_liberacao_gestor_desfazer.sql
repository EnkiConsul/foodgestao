CREATE OR REPLACE FUNCTION public.dp_solicitacao_atestado_ocorrencias()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.tipo IN ('folga','ferias','adiantamento','documento')
     OR (TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status) THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'aprovada' THEN
    PERFORM public.dp_ocorrencia_atestado_aplicar(NEW.id);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IN ('recusada','cancelada') THEN
    -- Liberação desfeita com "trabalhou normalmente": só cancela, sem falta.
    IF COALESCE(current_setting('app.liberacao_trabalhou', true), '') = 'on' THEN
      INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, metadata, autor_id)
      SELECT o.company_id, o.id, 'ocorrencia_cancelada',
             jsonb_build_object('motivo', 'Liberação do Gestor desfeita — colaborador trabalhou normalmente'), auth.uid()
        FROM public.dp_ocorrencias o WHERE o.solicitacao_id = NEW.id AND o.estado <> 'cancelada';
      UPDATE public.dp_ocorrencias SET estado = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(),
             motivo_cancelamento = 'Liberação do Gestor desfeita — trabalhou normalmente'
       WHERE solicitacao_id = NEW.id AND estado <> 'cancelada';
      RETURN NEW;
    END IF;

    INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, metadata, autor_id)
    SELECT o.company_id, o.id, 'atestado_recusado', 'tipo', o.tipo::text, 'falta',
           jsonb_build_object('motivo', NEW.resposta_admin), NEW.respondido_por
      FROM public.dp_ocorrencias o
     WHERE o.solicitacao_id = NEW.id AND o.estado <> 'cancelada';

    UPDATE public.dp_ocorrencias o
       SET tipo = CASE WHEN o.tipo = 'ausencia_justificada' THEN 'falta'::public.dp_ocorrencia_tipo ELSE o.tipo END,
           impacta_assiduidade = 'aguardando',
           impacta_ferias = 'aguardando',
           analise_status = 'pendente',
           analisado_por = NULL,
           analisado_em = NULL,
           justificativa_final = NULL,
           tratativa_observacao = COALESCE(NULLIF(btrim(COALESCE(NEW.resposta_admin,'')),''), 'Ausência recusada'),
           updated_at = now()
     WHERE o.solicitacao_id = NEW.id AND o.estado <> 'cancelada';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dp_liberacao_desfazer(p_id uuid, p_trabalhou boolean, p_justificativa text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s record; v_just text := NULLIF(btrim(COALESCE(p_justificativa,'')),'');
BEGIN
  SELECT * INTO s FROM public.dp_solicitacoes WHERE id = p_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'SOLICITACAO_NAO_ENCONTRADA'; END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), s.company_id) THEN RAISE EXCEPTION 'REGRAS_SEM_PERMISSAO'; END IF;
  IF COALESCE(s.motivo,'') NOT ILIKE 'Liberação do Gestor%' THEN RAISE EXCEPTION 'LIBERACAO_INVALIDA'; END IF;
  IF s.status NOT IN ('pendente','aprovada') THEN RAISE EXCEPTION 'LIBERACAO_JA_ENCERRADA'; END IF;
  IF v_just IS NULL OR length(v_just) < 10 THEN RAISE EXCEPTION 'LIBERACAO_JUSTIFICATIVA'; END IF;

  PERFORM set_config('app.liberacao_trabalhou', CASE WHEN p_trabalhou THEN 'on' ELSE 'off' END, true);
  UPDATE public.dp_solicitacoes
     SET status = CASE WHEN s.status = 'pendente' THEN 'recusada'::public.dp_solicitacao_status ELSE 'cancelada'::public.dp_solicitacao_status END,
         resposta_admin = CASE WHEN p_trabalhou THEN 'Trabalhou normalmente: ' ELSE 'Ausência sem autorização (falta): ' END || v_just,
         respondido_por = auth.uid(),
         respondido_em = now()
   WHERE id = p_id;
  PERFORM set_config('app.liberacao_trabalhou', 'off', true);

  IF NOT p_trabalhou THEN
    UPDATE public.dp_ocorrencias o SET
      assiduidade_risco = r.risco,
      assiduidade_risco_motivo = CASE WHEN r.risco THEN 'Liberação do Gestor desfeita — ausência sem autorização vira falta; por padrão perde o prêmio, o gestor decide.' END,
      assiduidade_decidido_em = NULL
      FROM private.dp_assiduidade_risco(s.colaborador_id, 'falta'::public.dp_ocorrencia_tipo, NULL) r
     WHERE o.solicitacao_id = p_id AND o.estado <> 'cancelada';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_liberacao_desfazer(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_liberacao_desfazer(uuid, boolean, text) TO authenticated;