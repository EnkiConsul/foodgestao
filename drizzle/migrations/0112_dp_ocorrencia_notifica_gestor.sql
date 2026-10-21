ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'ocorrencia_nova';

CREATE OR REPLACE FUNCTION private.dp_ocorrencia_notificar_gestor()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_nome text; v_titulo text; v_desc text;
BEGIN
  IF NEW.origem IS DISTINCT FROM 'colaborador'::public.dp_ocorrencia_origem THEN RETURN NEW; END IF;
  SELECT nome INTO v_nome FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
  v_titulo := CASE NEW.tipo::text
    WHEN 'falta' THEN 'Falta informada'
    WHEN 'previsao_falta' THEN 'Aviso de falta'
    WHEN 'atraso' THEN 'Atraso informado'
    WHEN 'previsao_atraso' THEN 'Aviso de atraso'
    WHEN 'atraso_intervalo' THEN 'Atraso no retorno do intervalo'
    WHEN 'previsao_atraso_intervalo' THEN 'Aviso de atraso no intervalo'
    WHEN 'saida_antecipada' THEN 'Saída antecipada informada'
    WHEN 'previsao_saida_antecipada' THEN 'Aviso de saída antecipada'
    WHEN 'atestado' THEN 'Atestado informado'
    WHEN 'ausencia_justificada' THEN 'Ausência justificada informada'
    WHEN 'esquecimento_marcacao' THEN 'Esquecimento de marcação de ponto'
    ELSE 'Erro no relógio de ponto' END;
  v_desc := format('%s — %s%s', COALESCE(v_nome,'Colaborador'), to_char(NEW.data_operacional,'DD/MM/YYYY'),
    CASE WHEN NEW.justificativa_inicial IS NOT NULL THEN '. Justificativa: ' || NEW.justificativa_inicial ELSE '' END);
  INSERT INTO public.dp_notificacoes (company_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave)
  VALUES (NEW.company_id, NEW.colaborador_id, 'ocorrencia_nova'::public.dp_notificacao_tipo, v_titulo, v_desc,
          'dp_ocorrencias', NEW.id, true, 'ocorrencia_nova:' || NEW.id::text)
  ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dp_ocorrencia_notificar_gestor: %', SQLERRM;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.dp_ocorrencia_notificar_gestor() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_dp_ocorrencia_notificar_gestor ON public.dp_ocorrencias;
CREATE TRIGGER trg_dp_ocorrencia_notificar_gestor
AFTER INSERT ON public.dp_ocorrencias
FOR EACH ROW EXECUTE FUNCTION private.dp_ocorrencia_notificar_gestor();