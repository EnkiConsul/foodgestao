ALTER TABLE public.dp_ocorrencias ADD COLUMN IF NOT EXISTS troca_id uuid REFERENCES public.dp_trocas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS dp_ocorrencias_troca_id_idx ON public.dp_ocorrencias(troca_id) WHERE troca_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.dp_troca_ocorrencias_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sol text; v_dest text; p record;
BEGIN
  IF NEW.status = 'aprovada' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'aprovada') THEN
    SELECT nome INTO v_sol FROM public.dp_colaboradores WHERE id = NEW.solicitante_id;
    SELECT nome INTO v_dest FROM public.dp_colaboradores WHERE id = NEW.destino_id;
    FOR p IN
      SELECT NEW.solicitante_id AS cid, v_dest AS colega
      UNION ALL SELECT NEW.destino_id, v_sol
    LOOP
      INSERT INTO public.dp_ocorrencias (company_id, colaborador_id, unidade_id, data_operacional, tipo, estado, origem,
        justificativa_inicial, impacta_assiduidade, impacta_ferias, analise_status, relevancia_operacional, troca_id, assiduidade_risco)
      SELECT NEW.company_id, p.cid, c.unidade_id, d.dia, 'divergencia_jornada', 'confirmada', 'sistema',
        'Troca de folga efetivada com ' || COALESCE(p.colega,'colega') ||
        ' (' || to_char(NEW.data_original,'DD/MM/YYYY') ||
        COALESCE(' ↔ ' || to_char(NEW.data_proposta,'DD/MM/YYYY'),'') || '). Justifica a jornada diferente da habitual neste dia.',
        'nao', 'nao', 'analisada', false, NEW.id, false
      FROM public.dp_colaboradores c,
           (SELECT NEW.data_original AS dia UNION SELECT NEW.data_proposta WHERE NEW.data_proposta IS NOT NULL) d
      WHERE c.id = p.cid
        AND NOT EXISTS (SELECT 1 FROM public.dp_ocorrencias o WHERE o.troca_id = NEW.id AND o.colaborador_id = p.cid
                          AND o.data_operacional = d.dia AND o.estado <> 'cancelada');
    END LOOP;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'aprovada' AND NEW.status <> 'aprovada' THEN
    UPDATE public.dp_ocorrencias SET estado = 'cancelada', cancelado_em = now(),
      motivo_cancelamento = 'Troca de folga cancelada'
     WHERE troca_id = NEW.id AND estado <> 'cancelada';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_troca_ocorrencias_trg() FROM PUBLIC;

DROP TRIGGER IF EXISTS dp_troca_ocorrencias_aiu ON public.dp_trocas;
CREATE TRIGGER dp_troca_ocorrencias_aiu AFTER INSERT OR UPDATE OF status ON public.dp_trocas
FOR EACH ROW EXECUTE FUNCTION private.dp_troca_ocorrencias_trg();