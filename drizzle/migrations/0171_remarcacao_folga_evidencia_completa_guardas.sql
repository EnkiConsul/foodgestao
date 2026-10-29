CREATE OR REPLACE FUNCTION private.dp_folga_remarcacao_evidencia_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.dp_dia_trabalho_excepcional%ROWTYPE; p record;
BEGIN
 IF NEW.status='cancelada' OR NEW.data_habitual_original IS NULL OR NEW.data_habitual_original=NEW.data THEN RETURN NEW; END IF;
 SELECT * INTO e FROM public.dp_dia_trabalho_excepcional WHERE colaborador_id=NEW.colaborador_id AND data=NEW.data_habitual_original;
 IF FOUND AND (e.company_id<>NEW.company_id OR e.origem<>'troca_gestor' OR (e.folga_origem_id IS NOT NULL AND e.folga_origem_id<>NEW.id)) THEN RAISE EXCEPTION 'FOLGA_ORIGEM_CONFLITANTE: existe outro remanejamento nessa data.'; END IF;
 SELECT * INTO p FROM public.dp_ocorrencia_previsto(NEW.colaborador_id,NEW.data);
 INSERT INTO public.dp_ocorrencias(company_id,colaborador_id,unidade_id,setor_id,data_operacional,tipo,estado,origem,justificativa_inicial,impacta_assiduidade,impacta_ferias,analise_status,analisado_em,relevancia_operacional,assiduidade_risco,tratativa_ponto,tratativa_status,tratativa_decisao,subtipo,folga_id)
 VALUES(NEW.company_id,NEW.colaborador_id,p.unidade_id,p.setor_id,NEW.data,'ausencia_justificada','confirmada','sistema','Folga remanejada de '||to_char(NEW.data_habitual_original,'DD/MM/YYYY')||' para '||to_char(NEW.data,'DD/MM/YYYY')||'.','nao','nao','analisada',now(),false,false,true,'concluida','abono','troca_folga',NEW.id)
 ON CONFLICT(folga_id) WHERE folga_id IS NOT NULL AND estado<>'cancelada' DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_folga_remarcacao_evidencia_trg() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_folga_remarcacao_evidencia_trg() TO service_role;
CREATE TRIGGER zzzzz_dp_folga_remarcacao_evidencia AFTER INSERT OR UPDATE ON public.dp_folgas FOR EACH ROW EXECUTE FUNCTION private.dp_folga_remarcacao_evidencia_trg();

CREATE OR REPLACE FUNCTION private.dp_folga_excecao_excluir_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN DELETE FROM public.dp_dia_trabalho_excepcional WHERE folga_origem_id=OLD.id AND company_id=OLD.company_id AND colaborador_id=OLD.colaborador_id AND origem='troca_gestor'; RETURN OLD; END $$;
REVOKE ALL ON FUNCTION private.dp_folga_excecao_excluir_trg() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_folga_excecao_excluir_trg() TO service_role;
CREATE TRIGGER dp_folga_excecao_excluir_bd BEFORE DELETE ON public.dp_folgas FOR EACH ROW EXECUTE FUNCTION private.dp_folga_excecao_excluir_trg();