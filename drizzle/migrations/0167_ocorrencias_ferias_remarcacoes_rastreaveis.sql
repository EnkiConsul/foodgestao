ALTER TABLE public.dp_ocorrencias ADD COLUMN IF NOT EXISTS ferias_gozo_id uuid REFERENCES public.dp_ferias_gozos(id) ON DELETE SET NULL;
ALTER TABLE public.dp_ocorrencias ADD COLUMN IF NOT EXISTS trabalho_excepcional_id uuid REFERENCES public.dp_dia_trabalho_excepcional(id) ON DELETE SET NULL;
ALTER TABLE public.dp_folgas ADD COLUMN IF NOT EXISTS data_habitual_original date;
ALTER TABLE public.dp_dia_trabalho_excepcional ADD COLUMN IF NOT EXISTS folga_origem_id uuid REFERENCES public.dp_folgas(id) ON DELETE SET NULL;
DROP INDEX IF EXISTS public.idx_dp_ocorrencias_dedup;
CREATE UNIQUE INDEX idx_dp_ocorrencias_dedup ON public.dp_ocorrencias(colaborador_id,data_operacional,tipo) WHERE estado<>'cancelada' AND marcacao_alvo IS NULL AND folga_id IS NULL AND troca_id IS NULL AND desligamento_processo_id IS NULL AND ferias_gozo_id IS NULL AND trabalho_excepcional_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dp_ocorrencias_ferias_dia ON public.dp_ocorrencias(ferias_gozo_id,data_operacional) WHERE ferias_gozo_id IS NOT NULL AND estado<>'cancelada';
CREATE UNIQUE INDEX IF NOT EXISTS dp_ocorrencias_trabalho_excepcional ON public.dp_ocorrencias(trabalho_excepcional_id) WHERE trabalho_excepcional_id IS NOT NULL AND estado<>'cancelada';

CREATE OR REPLACE FUNCTION private.dp_trabalho_excepcional_ocorrencia(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.dp_dia_trabalho_excepcional%ROWTYPE; p record;
BEGIN
 SELECT * INTO e FROM public.dp_dia_trabalho_excepcional WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR e.origem NOT IN ('troca_gestor','troca') THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.dp_ocorrencias WHERE colaborador_id=e.colaborador_id AND data_operacional=e.data AND subtipo='troca_trabalho' AND estado<>'cancelada' AND troca_id IS NOT NULL) THEN RETURN; END IF;
 SELECT * INTO p FROM public.dp_ocorrencia_previsto(e.colaborador_id,e.data);
 INSERT INTO public.dp_ocorrencias(company_id,colaborador_id,unidade_id,setor_id,data_operacional,tipo,estado,origem,previsto_entrada,previsto_saida,justificativa_inicial,impacta_assiduidade,impacta_ferias,analise_status,analisado_em,relevancia_operacional,assiduidade_risco,tratativa_ponto,tratativa_status,tratativa_decisao,subtipo,trabalho_excepcional_id)
 VALUES(e.company_id,e.colaborador_id,p.unidade_id,p.setor_id,e.data,'divergencia_jornada','confirmada','sistema',p.entrada,p.saida,'Trabalho em dia de folga habitual remanejada. Considerar a jornada autorizada no sistema externo de ponto.','nao','nao','analisada',now(),false,false,true,'concluida','confirmada','troca_trabalho',e.id)
 ON CONFLICT(trabalho_excepcional_id) WHERE trabalho_excepcional_id IS NOT NULL AND estado<>'cancelada' DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION private.dp_trabalho_excepcional_ocorrencia(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_trabalho_excepcional_ocorrencia(uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.dp_trabalho_excepcional_evidencia_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  UPDATE public.dp_ocorrencias SET estado='cancelada',cancelado_em=now(),motivo_cancelamento='Trabalho excepcional retirado na origem' WHERE trabalho_excepcional_id=OLD.id AND estado<>'cancelada'; RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.data IS DISTINCT FROM OLD.data OR NEW.colaborador_id IS DISTINCT FROM OLD.colaborador_id OR NEW.origem IS DISTINCT FROM OLD.origem) THEN
  UPDATE public.dp_ocorrencias SET estado='cancelada',cancelado_em=now(),motivo_cancelamento='Trabalho excepcional substituído na origem' WHERE trabalho_excepcional_id=OLD.id AND estado<>'cancelada';
 END IF;
 PERFORM private.dp_trabalho_excepcional_ocorrencia(NEW.id); RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_trabalho_excepcional_evidencia_trg() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_trabalho_excepcional_evidencia_trg() TO service_role;
CREATE TRIGGER zz_dp_trabalho_excepcional_evidencia AFTER INSERT OR UPDATE OR DELETE ON public.dp_dia_trabalho_excepcional FOR EACH ROW EXECUTE FUNCTION private.dp_trabalho_excepcional_evidencia_trg();

CREATE OR REPLACE FUNCTION private.dp_folga_original_capturar_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.data IS DISTINCT FROM OLD.data THEN NEW.data_habitual_original:=OLD.data; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_folga_original_capturar_trg() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_folga_original_capturar_trg() TO service_role;
CREATE TRIGGER dp_folga_original_capturar BEFORE UPDATE OF data ON public.dp_folgas FOR EACH ROW EXECUTE FUNCTION private.dp_folga_original_capturar_trg();

CREATE OR REPLACE FUNCTION private.dp_folga_evidencia_completa_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  UPDATE public.dp_ocorrencias o SET estado='cancelada',cancelado_em=now(),motivo_cancelamento='Folga de origem excluída' FROM public.dp_dia_trabalho_excepcional e WHERE o.trabalho_excepcional_id=e.id AND e.folga_origem_id=OLD.id AND o.estado<>'cancelada'; RETURN OLD;
 END IF;
 IF NEW.status='cancelada' THEN
  UPDATE public.dp_ocorrencias o SET estado='cancelada',cancelado_em=now(),motivo_cancelamento='Remanejamento cancelado na origem' FROM public.dp_dia_trabalho_excepcional e WHERE o.trabalho_excepcional_id=e.id AND e.folga_origem_id=NEW.id AND o.estado<>'cancelada'; RETURN NEW;
 END IF;
 PERFORM private.dp_folga_ocorrencia(NEW.id,NEW.solicitacao_id,NULL);
 IF NEW.data_habitual_original IS NOT NULL AND NEW.data_habitual_original<>NEW.data THEN
  INSERT INTO public.dp_dia_trabalho_excepcional(company_id,colaborador_id,data,origem,criado_por,folga_origem_id) VALUES(NEW.company_id,NEW.colaborador_id,NEW.data_habitual_original,'troca_gestor',auth.uid(),NEW.id)
  ON CONFLICT(colaborador_id,data) DO UPDATE SET folga_origem_id=EXCLUDED.folga_origem_id WHERE public.dp_dia_trabalho_excepcional.company_id=EXCLUDED.company_id AND public.dp_dia_trabalho_excepcional.origem='troca_gestor' AND (public.dp_dia_trabalho_excepcional.folga_origem_id IS NULL OR public.dp_dia_trabalho_excepcional.folga_origem_id=EXCLUDED.folga_origem_id);
 END IF;
 UPDATE public.dp_ocorrencias SET tratativa_status='concluida',tratativa_decisao='abono' WHERE folga_id=NEW.id AND estado<>'cancelada' AND tratativa_status='pendente' AND tratativa_decisao IS NULL;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_folga_evidencia_completa_trg() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_folga_evidencia_completa_trg() TO service_role;
CREATE TRIGGER zzz_dp_folga_evidencia_completa AFTER INSERT OR UPDATE OR DELETE ON public.dp_folgas FOR EACH ROW EXECUTE FUNCTION private.dp_folga_evidencia_completa_trg();

CREATE OR REPLACE FUNCTION public.dp_folga_admin_trocar_fixa(p_colaborador uuid,p_data_fixa date,p_data_nova date,p_motivo text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid(); v_company uuid;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 IF p_colaborador IS NULL OR p_data_fixa IS NULL OR p_data_nova IS NULL OR p_data_fixa=p_data_nova THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id=p_colaborador;
 IF v_company IS NULL THEN RAISE EXCEPTION 'NAO_ENCONTRADO'; END IF;
 IF NOT private.is_company_admin_or_owner(v_uid,v_company) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_colaborador::text||p_data_nova::text,0));
 IF EXISTS(SELECT 1 FROM public.dp_folgas WHERE colaborador_id=p_colaborador AND data=p_data_nova AND status<>'cancelada') THEN RAISE EXCEPTION 'JA_TEM_FOLGA'; END IF;
 INSERT INTO public.dp_dia_trabalho_excepcional(company_id,colaborador_id,data,origem,criado_por) VALUES(v_company,p_colaborador,p_data_fixa,'troca_gestor',v_uid) ON CONFLICT(colaborador_id,data) DO NOTHING;
 INSERT INTO public.dp_folgas(company_id,colaborador_id,data,origem,status,observacao,criado_por,direito_origem,data_habitual_original) VALUES(v_company,p_colaborador,p_data_nova,'troca','agendada',coalesce(nullif(trim(p_motivo),''),'Troca da folga fixa pelo gestor'),v_uid,'folga_fixa_deslocada',p_data_fixa);
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.dp_folga_admin_trocar_fixa(uuid,date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dp_folga_admin_trocar_fixa(uuid,date,date,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.dp_ferias_ocorrencias_sync(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g public.dp_ferias_gozos%ROWTYPE; c public.dp_colaboradores%ROWTYPE; d date;
BEGIN
 SELECT * INTO g FROM public.dp_ferias_gozos WHERE id=_id FOR UPDATE; IF NOT FOUND THEN RETURN; END IF;
 UPDATE public.dp_ocorrencias SET estado='cancelada',cancelado_em=now(),motivo_cancelamento='Férias canceladas ou período substituído' WHERE ferias_gozo_id=g.id AND estado<>'cancelada' AND (g.status::text NOT IN ('aprovado','em_gozo','concluido') OR data_operacional<g.data_inicio OR data_operacional>g.data_fim);
 IF g.status::text NOT IN ('aprovado','em_gozo','concluido') THEN RETURN; END IF;
 SELECT * INTO c FROM public.dp_colaboradores WHERE id=g.colaborador_id AND company_id=g.company_id; IF NOT FOUND THEN RETURN; END IF;
 FOR d IN SELECT generate_series(g.data_inicio,g.data_fim,interval '1 day')::date LOOP
  INSERT INTO public.dp_ocorrencias(company_id,colaborador_id,unidade_id,setor_id,data_operacional,tipo,estado,origem,justificativa_inicial,impacta_assiduidade,impacta_ferias,analise_status,analisado_em,relevancia_operacional,assiduidade_risco,tratativa_ponto,tratativa_status,tratativa_decisao,subtipo,ferias_gozo_id)
  VALUES(g.company_id,g.colaborador_id,c.unidade_id,c.setor_id,d,'ausencia_justificada','confirmada','sistema','Férias aprovadas: '||to_char(g.data_inicio,'DD/MM/YYYY')||' a '||to_char(g.data_fim,'DD/MM/YYYY')||'.','nao','nao','analisada',coalesce(g.aprovado_em,now()),false,false,true,'concluida','abono','ferias',g.id)
  ON CONFLICT(ferias_gozo_id,data_operacional) WHERE ferias_gozo_id IS NOT NULL AND estado<>'cancelada' DO NOTHING;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION private.dp_ferias_ocorrencias_sync(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_ferias_ocorrencias_sync(uuid) TO service_role;
CREATE OR REPLACE FUNCTION private.dp_ferias_ocorrencias_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN UPDATE public.dp_ocorrencias SET estado='cancelada',cancelado_em=now(),motivo_cancelamento='Férias excluídas na origem' WHERE ferias_gozo_id=OLD.id AND estado<>'cancelada'; RETURN OLD; END IF;
 PERFORM private.dp_ferias_ocorrencias_sync(NEW.id); RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_ferias_ocorrencias_trg() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_ferias_ocorrencias_trg() TO service_role;
CREATE TRIGGER dp_ferias_ocorrencias AFTER INSERT OR UPDATE OF status,data_inicio,data_fim OR DELETE ON public.dp_ferias_gozos FOR EACH ROW EXECUTE FUNCTION private.dp_ferias_ocorrencias_trg();

CREATE OR REPLACE FUNCTION private.dp_ocorrencia_fontes_proteger_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND (OLD.ferias_gozo_id IS NOT NULL OR OLD.trabalho_excepcional_id IS NOT NULL) AND (NEW.ferias_gozo_id IS DISTINCT FROM OLD.ferias_gozo_id OR NEW.trabalho_excepcional_id IS DISTINCT FROM OLD.trabalho_excepcional_id OR NEW.subtipo IS DISTINCT FROM OLD.subtipo OR NEW.data_operacional IS DISTINCT FROM OLD.data_operacional OR NEW.colaborador_id IS DISTINCT FROM OLD.colaborador_id) AND pg_trigger_depth()<=1 THEN RAISE EXCEPTION 'OCORRENCIA_ORIGEM_IMUTAVEL'; END IF;
 IF NEW.ferias_gozo_id IS NOT NULL OR NEW.trabalho_excepcional_id IS NOT NULL THEN NEW.impacta_assiduidade:='nao'; NEW.impacta_ferias:='nao'; NEW.assiduidade_risco:=false; NEW.assiduidade_risco_motivo:=NULL; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_ocorrencia_fontes_proteger_trg() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_ocorrencia_fontes_proteger_trg() TO service_role;
CREATE TRIGGER zzz_dp_ocorrencia_fontes_proteger BEFORE INSERT OR UPDATE ON public.dp_ocorrencias FOR EACH ROW EXECUTE FUNCTION private.dp_ocorrencia_fontes_proteger_trg();