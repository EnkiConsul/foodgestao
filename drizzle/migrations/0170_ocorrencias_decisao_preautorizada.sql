CREATE OR REPLACE FUNCTION private.dp_ocorrencia_decisao_preautorizada_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE autorizada boolean:=false;
BEGIN
 IF NEW.estado='cancelada' OR NEW.tratativa_status<>'pendente' OR NEW.tratativa_decisao IS NOT NULL THEN RETURN NEW; END IF;
 autorizada:=NEW.ferias_gozo_id IS NOT NULL OR NEW.folga_id IS NOT NULL OR NEW.troca_id IS NOT NULL OR NEW.trabalho_excepcional_id IS NOT NULL OR (NEW.subtipo='dispensa_aviso_art488' AND NEW.desligamento_processo_id IS NOT NULL);
 IF NOT autorizada AND NEW.tipo='ausencia_justificada' AND NEW.origem='sistema' AND NEW.analise_status='analisada' AND NEW.solicitacao_id IS NOT NULL THEN
  SELECT EXISTS(SELECT 1 FROM public.dp_solicitacoes s WHERE s.id=NEW.solicitacao_id AND s.company_id=NEW.company_id AND s.colaborador_id=NEW.colaborador_id AND s.tipo='atestado' AND s.status='aprovada' AND s.removido_em IS NULL) INTO autorizada;
 END IF;
 IF autorizada THEN NEW.tratativa_status:='concluida'; NEW.tratativa_decisao:=CASE WHEN NEW.subtipo='troca_trabalho' THEN 'confirmada' ELSE 'abono' END; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_ocorrencia_decisao_preautorizada_trg() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_ocorrencia_decisao_preautorizada_trg() TO service_role;
CREATE TRIGGER zzzz_dp_ocorrencia_decisao_preautorizada BEFORE INSERT OR UPDATE ON public.dp_ocorrencias FOR EACH ROW EXECUTE FUNCTION private.dp_ocorrencia_decisao_preautorizada_trg();