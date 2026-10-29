ALTER TABLE public.dp_ocorrencias ADD COLUMN IF NOT EXISTS origem_evidencia jsonb;
CREATE OR REPLACE FUNCTION private.dp_ocorrencia_evidencia_snapshot_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.origem_evidencia IS NULL THEN
  IF NEW.ferias_gozo_id IS NOT NULL THEN NEW.origem_evidencia:=jsonb_build_object('tipo','ferias','id',NEW.ferias_gozo_id);
  ELSIF NEW.trabalho_excepcional_id IS NOT NULL THEN NEW.origem_evidencia:=jsonb_build_object('tipo','trabalho_excepcional','id',NEW.trabalho_excepcional_id);
  ELSIF NEW.folga_id IS NOT NULL THEN NEW.origem_evidencia:=jsonb_build_object('tipo','folga','id',NEW.folga_id);
  END IF;
 END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_ocorrencia_evidencia_snapshot_trg() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_ocorrencia_evidencia_snapshot_trg() TO service_role;
CREATE TRIGGER zzzz_dp_ocorrencia_evidencia_snapshot BEFORE INSERT ON public.dp_ocorrencias FOR EACH ROW EXECUTE FUNCTION private.dp_ocorrencia_evidencia_snapshot_trg();

CREATE OR REPLACE FUNCTION private.dp_fontes_cancelar_antes_excluir_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='dp_ferias_gozos' THEN
  UPDATE public.dp_ocorrencias SET estado='cancelada',cancelado_em=now(),motivo_cancelamento='Férias excluídas na origem',origem_evidencia=coalesce(origem_evidencia,jsonb_build_object('tipo','ferias','id',OLD.id)) WHERE ferias_gozo_id=OLD.id;
 ELSIF TG_TABLE_NAME='dp_dia_trabalho_excepcional' THEN
  UPDATE public.dp_ocorrencias SET estado='cancelada',cancelado_em=now(),motivo_cancelamento='Trabalho excepcional retirado na origem',origem_evidencia=coalesce(origem_evidencia,jsonb_build_object('tipo','trabalho_excepcional','id',OLD.id)) WHERE trabalho_excepcional_id=OLD.id;
 ELSE
  UPDATE public.dp_ocorrencias o SET estado='cancelada',cancelado_em=now(),motivo_cancelamento='Folga de origem excluída',origem_evidencia=coalesce(o.origem_evidencia,jsonb_build_object('tipo','trabalho_excepcional','id',e.id,'folga_id',OLD.id)) FROM public.dp_dia_trabalho_excepcional e WHERE o.trabalho_excepcional_id=e.id AND e.folga_origem_id=OLD.id;
 END IF; RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION private.dp_fontes_cancelar_antes_excluir_trg() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_fontes_cancelar_antes_excluir_trg() TO service_role;
CREATE TRIGGER dp_ferias_evidencia_bd BEFORE DELETE ON public.dp_ferias_gozos FOR EACH ROW EXECUTE FUNCTION private.dp_fontes_cancelar_antes_excluir_trg();
CREATE TRIGGER dp_trabalho_evidencia_bd BEFORE DELETE ON public.dp_dia_trabalho_excepcional FOR EACH ROW EXECUTE FUNCTION private.dp_fontes_cancelar_antes_excluir_trg();
CREATE TRIGGER dp_folga_evidencia_bd BEFORE DELETE ON public.dp_folgas FOR EACH ROW EXECUTE FUNCTION private.dp_fontes_cancelar_antes_excluir_trg();

CREATE OR REPLACE FUNCTION private.dp_folga_original_capturar_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NEW.data IS DISTINCT FROM OLD.data THEN NEW.data_habitual_original:=coalesce(OLD.data_habitual_original,OLD.data); END IF; RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION private.dp_fontes_identidade_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.colaborador_id IS DISTINCT FROM OLD.colaborador_id THEN RAISE EXCEPTION 'OCORRENCIA_ORIGEM_IMUTAVEL'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_fontes_identidade_trg() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_fontes_identidade_trg() TO service_role;
CREATE TRIGGER dp_ferias_identidade BEFORE UPDATE OF company_id,colaborador_id ON public.dp_ferias_gozos FOR EACH ROW EXECUTE FUNCTION private.dp_fontes_identidade_trg();
CREATE TRIGGER dp_folga_identidade BEFORE UPDATE OF company_id,colaborador_id ON public.dp_folgas FOR EACH ROW EXECUTE FUNCTION private.dp_fontes_identidade_trg();

CREATE OR REPLACE FUNCTION private.dp_trabalho_excepcional_evidencia_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND (NEW.data IS DISTINCT FROM OLD.data OR NEW.colaborador_id IS DISTINCT FROM OLD.colaborador_id OR NEW.origem IS DISTINCT FROM OLD.origem) THEN
  UPDATE public.dp_ocorrencias SET estado='cancelada',cancelado_em=now(),motivo_cancelamento='Trabalho excepcional substituído na origem' WHERE trabalho_excepcional_id=OLD.id AND estado<>'cancelada';
 END IF;
 IF NEW.origem='troca_gestor' THEN PERFORM private.dp_trabalho_excepcional_ocorrencia(NEW.id); END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.dp_folga_excecao_retirar_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='cancelada' THEN
  DELETE FROM public.dp_dia_trabalho_excepcional WHERE folga_origem_id=NEW.id AND company_id=NEW.company_id AND colaborador_id=NEW.colaborador_id AND origem='troca_gestor';
 END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_folga_excecao_retirar_trg() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_folga_excecao_retirar_trg() TO service_role;
CREATE TRIGGER zzzz_dp_folga_excecao_retirar AFTER UPDATE OF status ON public.dp_folgas FOR EACH ROW EXECUTE FUNCTION private.dp_folga_excecao_retirar_trg();