ALTER TABLE public.dp_ocorrencias ADD COLUMN IF NOT EXISTS folga_id uuid REFERENCES public.dp_folgas(id) ON DELETE SET NULL;
ALTER TABLE public.dp_ocorrencias ADD COLUMN IF NOT EXISTS subtipo text;
ALTER TABLE public.dp_folgas ADD COLUMN IF NOT EXISTS solicitacao_id uuid REFERENCES public.dp_solicitacoes(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX dp_ocorrencias_folga_ativa ON public.dp_ocorrencias(folga_id) WHERE folga_id IS NOT NULL AND estado <> 'cancelada';
CREATE UNIQUE INDEX dp_ocorrencias_troca_dia_ativa ON public.dp_ocorrencias(troca_id,colaborador_id,data_operacional) WHERE troca_id IS NOT NULL AND estado <> 'cancelada';
-- Preserve manual/medical deduplication, but independently trace authorized leave evidence.
DROP INDEX public.idx_dp_ocorrencias_dedup;
CREATE UNIQUE INDEX idx_dp_ocorrencias_dedup ON public.dp_ocorrencias(colaborador_id,data_operacional,tipo) WHERE estado <> 'cancelada' AND marcacao_alvo IS NULL AND folga_id IS NULL AND troca_id IS NULL;

CREATE OR REPLACE FUNCTION private.dp_folga_ocorrencia(_folga uuid,_solicitacao uuid DEFAULT NULL,_troca uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.dp_folgas%ROWTYPE; s public.dp_solicitacoes%ROWTYPE; sub text; titulo text;
BEGIN
 SELECT * INTO f FROM public.dp_folgas WHERE id=_folga FOR UPDATE;
 IF NOT FOUND OR f.status='cancelada' THEN RETURN; END IF;
 IF _solicitacao IS NOT NULL THEN
   SELECT * INTO s FROM public.dp_solicitacoes WHERE id=_solicitacao AND company_id=f.company_id AND colaborador_id=f.colaborador_id AND status='aprovada' AND removido_em IS NULL;
   IF NOT FOUND THEN RETURN; END IF;
 END IF;
 -- Swap rows are created before status approval: only the swap trigger may justify them.
 IF _troca IS NULL AND coalesce(f.observacao,'') LIKE 'Troca aprovada (id=%' THEN RETURN; END IF;
 sub := CASE WHEN _troca IS NOT NULL OR f.direito_origem='folga_fixa_deslocada' OR (s.data_fim IS NOT NULL AND s.data_fim<>s.data_alvo) THEN 'troca_folga'
             WHEN f.tipo::text='compensatoria' OR coalesce(f.observacao,'') ILIKE '%compensat%' OR coalesce(s.motivo,'') ILIKE '%compensa%' THEN 'compensacao_feriado'
             WHEN f.extra THEN 'folga_extra' ELSE NULL END;
 IF sub IS NULL THEN RETURN; END IF;
 titulo := CASE sub WHEN 'troca_folga' THEN 'Folga autorizada por troca de folga' WHEN 'compensacao_feriado' THEN 'Compensação de feriado trabalhado autorizada' ELSE 'Folga extra autorizada pelo gestor' END;
 INSERT INTO public.dp_ocorrencias(company_id,colaborador_id,unidade_id,setor_id,data_operacional,tipo,estado,origem,justificativa_inicial,impacta_assiduidade,impacta_ferias,analise_status,analisado_em,analisado_por,relevancia_operacional,assiduidade_risco,tratativa_ponto,tratativa_status,folga_id,solicitacao_id,troca_id,subtipo)
 SELECT f.company_id,f.colaborador_id,c.unidade_id,c.setor_id,f.data,'ausencia_justificada','confirmada','sistema',titulo || '. Justifica a ausência no sistema externo de ponto; sem impacto na assiduidade ou férias.', 'nao','nao','analisada',now(),auth.uid(),false,false,true,'pendente',f.id,_solicitacao,_troca,sub
 FROM public.dp_colaboradores c WHERE c.id=f.colaborador_id AND c.company_id=f.company_id
 ON CONFLICT (folga_id) WHERE folga_id IS NOT NULL AND estado <> 'cancelada' DO UPDATE SET solicitacao_id=coalesce(public.dp_ocorrencias.solicitacao_id,EXCLUDED.solicitacao_id),troca_id=coalesce(public.dp_ocorrencias.troca_id,EXCLUDED.troca_id),subtipo=EXCLUDED.subtipo;
END $$;
REVOKE ALL ON FUNCTION private.dp_folga_ocorrencia(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_folga_ocorrencia(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.dp_folga_ocorrencias_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   UPDATE public.dp_ocorrencias SET estado='cancelada',cancelado_em=now(),cancelado_por=auth.uid(),motivo_cancelamento='Folga excluída ou substituída' WHERE folga_id=OLD.id AND estado<>'cancelada';
   RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.status='cancelada' OR NEW.data IS DISTINCT FROM OLD.data OR NEW.colaborador_id IS DISTINCT FROM OLD.colaborador_id) THEN
   UPDATE public.dp_ocorrencias SET estado='cancelada',cancelado_em=now(),cancelado_por=auth.uid(),motivo_cancelamento='Folga cancelada ou substituída' WHERE folga_id=NEW.id AND estado<>'cancelada';
 END IF;
 PERFORM private.dp_folga_ocorrencia(NEW.id,NEW.solicitacao_id,NULL);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_folga_ocorrencias_trg() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_folga_ocorrencias_trg() TO service_role;
CREATE TRIGGER dp_folga_ocorrencias_aiud AFTER INSERT OR UPDATE OF status,data,extra,tipo,solicitacao_id OR DELETE ON public.dp_folgas FOR EACH ROW EXECUTE FUNCTION private.dp_folga_ocorrencias_trg();

CREATE OR REPLACE FUNCTION private.dp_folga_solicitacao_ocorrencias_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fid uuid;
BEGIN
 IF NEW.tipo<>'folga' THEN RETURN NEW; END IF;
 IF NEW.status='aprovada' AND NEW.removido_em IS NULL AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
   SELECT id INTO fid FROM public.dp_folgas WHERE company_id=NEW.company_id AND colaborador_id=NEW.colaborador_id AND data=NEW.data_alvo AND status<>'cancelada' ORDER BY created_at DESC LIMIT 1;
   IF fid IS NULL THEN RAISE EXCEPTION 'FOLGA_APROVADA_SEM_EFETIVACAO'; END IF;
   UPDATE public.dp_folgas SET solicitacao_id=NEW.id WHERE id=fid AND (solicitacao_id IS NULL OR solicitacao_id=NEW.id);
   PERFORM private.dp_folga_ocorrencia(fid,NEW.id,NULL);
 ELSIF NEW.status<>'aprovada' OR NEW.removido_em IS NOT NULL THEN
   UPDATE public.dp_ocorrencias SET estado='cancelada',cancelado_em=now(),cancelado_por=auth.uid(),motivo_cancelamento='Solicitação de folga cancelada ou removida' WHERE solicitacao_id=NEW.id AND folga_id IS NOT NULL AND estado<>'cancelada';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_folga_solicitacao_ocorrencias_trg() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_folga_solicitacao_ocorrencias_trg() TO service_role;
CREATE TRIGGER dp_folga_solicitacao_ocorrencias_aiu AFTER INSERT OR UPDATE OF status,removido_em ON public.dp_solicitacoes FOR EACH ROW EXECUTE FUNCTION private.dp_folga_solicitacao_ocorrencias_trg();

CREATE OR REPLACE FUNCTION private.dp_troca_ocorrencias_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; fid uuid;
BEGIN
 IF NEW.status='aprovada' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'aprovada') THEN
   FOR p IN SELECT NEW.solicitante_id cid,NEW.data_proposta folga,NEW.data_original trabalho UNION ALL SELECT NEW.destino_id,NEW.data_original,NEW.data_proposta LOOP
     SELECT id INTO fid FROM public.dp_folgas WHERE company_id=NEW.company_id AND colaborador_id=p.cid AND data=p.folga AND status<>'cancelada' AND observacao='Troca aprovada (id=' || NEW.id || ')' ORDER BY created_at DESC LIMIT 1;
     IF fid IS NULL THEN RAISE EXCEPTION 'TROCA_APROVADA_SEM_FOLGA_EFETIVADA'; END IF;
     PERFORM private.dp_folga_ocorrencia(fid,NULL,NEW.id);
     INSERT INTO public.dp_ocorrencias(company_id,colaborador_id,unidade_id,setor_id,data_operacional,tipo,estado,origem,justificativa_inicial,impacta_assiduidade,impacta_ferias,analise_status,analisado_em,relevancia_operacional,assiduidade_risco,tratativa_ponto,tratativa_status,troca_id,subtipo)
     SELECT NEW.company_id,p.cid,c.unidade_id,c.setor_id,p.trabalho,'divergencia_jornada','confirmada','sistema','Trabalho em dia de folga habitual por troca autorizada. Considerar a jornada invertida no sistema externo de ponto.','nao','nao','analisada',now(),false,false,true,'pendente',NEW.id,'troca_trabalho' FROM public.dp_colaboradores c WHERE c.id=p.cid AND p.trabalho IS NOT NULL
     ON CONFLICT (troca_id,colaborador_id,data_operacional) WHERE troca_id IS NOT NULL AND estado<>'cancelada' DO NOTHING;
   END LOOP;
 ELSIF TG_OP='UPDATE' AND OLD.status='aprovada' AND NEW.status<>'aprovada' THEN
   UPDATE public.dp_ocorrencias SET estado='cancelada',cancelado_em=now(),cancelado_por=auth.uid(),motivo_cancelamento='Troca de folga cancelada' WHERE troca_id=NEW.id AND estado<>'cancelada';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_troca_ocorrencias_trg() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_troca_ocorrencias_trg() TO service_role;

CREATE OR REPLACE FUNCTION private.dp_ocorrencia_folga_proteger_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF TG_OP='UPDATE' AND (OLD.folga_id IS NOT NULL OR OLD.troca_id IS NOT NULL) AND (NEW.folga_id IS DISTINCT FROM OLD.folga_id OR NEW.troca_id IS DISTINCT FROM OLD.troca_id OR NEW.subtipo IS DISTINCT FROM OLD.subtipo OR NEW.colaborador_id IS DISTINCT FROM OLD.colaborador_id OR NEW.data_operacional IS DISTINCT FROM OLD.data_operacional) AND pg_trigger_depth()<=1 THEN
   RAISE EXCEPTION 'OCORRENCIA_ORIGEM_IMUTAVEL: altere a folga ou troca de origem.';
 END IF;
 IF NEW.folga_id IS NOT NULL OR NEW.troca_id IS NOT NULL THEN
   NEW.impacta_assiduidade:='nao'; NEW.impacta_ferias:='nao'; NEW.assiduidade_risco:=false; NEW.assiduidade_risco_motivo:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_ocorrencia_folga_proteger_trg() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_ocorrencia_folga_proteger_trg() TO service_role;
CREATE TRIGGER zz_dp_ocorrencia_folga_proteger BEFORE INSERT OR UPDATE ON public.dp_ocorrencias FOR EACH ROW EXECUTE FUNCTION private.dp_ocorrencia_folga_proteger_trg();