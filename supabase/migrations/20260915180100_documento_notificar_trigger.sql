-- Gatilho que avisa o colaborador: documento novo e comprovante de pagamento.
CREATE OR REPLACE FUNCTION public.dp_documento_notificar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_label text;
  v_comp text;
  v_detalhe text;
BEGIN
  -- Fora do portal: disciplinar, envio do próprio colaborador, recusado ou não ativo.
  IF NEW.colaborador_id IS NULL
     OR NEW.tipo::text = 'disciplinar'
     OR COALESCE(NEW.submetido_por_colaborador, false)
     OR COALESCE(NEW.ciclo_status, 'ativo') <> 'ativo'
     OR COALESCE(NEW.aprovacao_status::text, '') = 'recusado' THEN
    RETURN NEW;
  END IF;

  SELECT c.user_id INTO v_user
  FROM public.dp_colaboradores c
  WHERE c.id = NEW.colaborador_id;
  IF v_user IS NULL THEN
    RETURN NEW;
  END IF;

  v_label := CASE NEW.tipo::text
    WHEN 'contracheque' THEN 'Contracheque'
    WHEN 'contracheque_13' THEN 'Contracheque do 13º'
    WHEN 'contracheque_ferias' THEN 'Contracheque de Férias'
    WHEN 'recibo_ferias' THEN 'Recibo de Férias'
    WHEN 'aviso_ferias' THEN 'Aviso de Férias'
    WHEN 'ferias' THEN 'Férias'
    WHEN 'adiantamento' THEN 'Adiantamento Salarial'
    WHEN 'trct' THEN 'Termo de Rescisão'
    WHEN 'demonstrativo_rescisorio' THEN 'Demonstrativo Rescisório'
    WHEN 'plr' THEN 'Participação nos Resultados'
    WHEN 'pro_labore' THEN 'Recibo de Pró-labore'
    WHEN 'outros_pagamentos' THEN 'Recibo de Pagamento'
    WHEN 'ponto' THEN 'Espelho de Ponto'
    WHEN 'contrato' THEN 'Contrato de Trabalho'
    WHEN 'admissao' THEN 'Documento de Admissão'
    ELSE COALESCE(NULLIF(btrim(NEW.titulo), ''), 'Documento')
  END;

  v_comp := CASE
    WHEN NEW.referencia_data IS NOT NULL THEN ' · Competência ' || to_char(NEW.referencia_data, 'MM/YYYY')
    ELSE ''
  END;

  IF TG_OP = 'INSERT' THEN
    v_detalhe := v_label || v_comp || '. Toque para visualizar.'
      || CASE WHEN COALESCE(NEW.exige_aceite, false)
              THEN ' Precisa da sua confirmação de recebimento.' ELSE '' END;
    INSERT INTO public.dp_notificacoes (
      company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, chave
    ) VALUES (
      NEW.company_id, v_user, NEW.colaborador_id, 'documento_novo',
      'Novo documento disponível', v_detalhe, 'dp_documentos', NEW.id,
      'documento_novo:' || NEW.id::text
    ) ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
  END IF;

  IF NEW.comprovante_file_path IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.comprovante_file_path IS DISTINCT FROM OLD.comprovante_file_path) THEN
    v_detalhe := v_label || v_comp
      || CASE WHEN NEW.comprovante_pago_em IS NOT NULL
              THEN ' · pago em ' || to_char(NEW.comprovante_pago_em, 'DD/MM/YYYY') ELSE '' END
      || '. Toque para visualizar o comprovante.';
    INSERT INTO public.dp_notificacoes (
      company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, chave
    ) VALUES (
      NEW.company_id, v_user, NEW.colaborador_id, 'comprovante_pagamento',
      CASE WHEN TG_OP = 'UPDATE' AND OLD.comprovante_file_path IS NOT NULL
           THEN 'Comprovante de pagamento atualizado'
           ELSE 'Comprovante de pagamento disponível' END,
      v_detalhe, 'dp_documentos', NEW.id,
      'comprovante_pagamento:' || NEW.id::text || ':' || NEW.comprovante_file_path
    ) ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_documento_notificar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_dp_documento_notificar ON public.dp_documentos;
CREATE TRIGGER trg_dp_documento_notificar
AFTER INSERT OR UPDATE OF comprovante_file_path, comprovante_pago_em ON public.dp_documentos
FOR EACH ROW EXECUTE FUNCTION public.dp_documento_notificar();
