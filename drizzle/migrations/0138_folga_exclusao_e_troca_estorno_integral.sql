-- Retire evidence before foreign-key SET NULL runs.
CREATE TRIGGER dp_folga_ocorrencias_bd BEFORE DELETE ON public.dp_folgas FOR EACH ROW EXECUTE FUNCTION private.dp_folga_ocorrencias_trg();
CREATE OR REPLACE FUNCTION public.dp_cancelar_troca(_troca_id uuid,_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.dp_trocas%ROWTYPE; p record; f record; _uid uuid:=auth.uid();
BEGIN
 IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(_motivo,'')))<3 THEN RAISE EXCEPTION 'Justificativa obrigatória' USING ERRCODE='check_violation'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_troca_id::text || '|troca',0));
 SELECT * INTO t FROM public.dp_trocas WHERE id=_troca_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Troca não encontrada'; END IF;
 IF NOT (private.is_company_admin_or_owner(_uid,t.company_id) OR public.is_super_admin(_uid)) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF t.status<>'aprovada' THEN RAISE EXCEPTION 'Somente trocas aprovadas podem ser canceladas'; END IF;
 FOR p IN SELECT t.solicitante_id cid,t.data_original original,t.data_proposta nova UNION ALL SELECT t.destino_id,t.data_proposta,t.data_original LOOP
  FOR f IN SELECT * FROM public.dp_folgas WHERE company_id=t.company_id AND colaborador_id=p.cid AND data=p.nova AND status<>'cancelada' AND observacao='Troca aprovada (id=' || t.id || ')' FOR UPDATE LOOP
   UPDATE public.dp_folgas SET status='cancelada',updated_at=now() WHERE id=f.id;
   INSERT INTO public.dp_folgas_canceladas(company_id,colaborador_id,folga_id,data,motivo,origem_cancelamento,cancelado_por) VALUES(t.company_id,p.cid,f.id,f.data,'Troca cancelada pelo gestor: ' || btrim(_motivo),'troca',_uid);
  END LOOP;
 END LOOP;
 -- Retire swap evidence before restoring any previous exceptional leave.
 UPDATE public.dp_trocas SET status='cancelada',gestor_resposta='cancelada: ' || btrim(_motivo),gestor_respondido_em=now(),gestor_id=_uid,updated_at=now() WHERE id=t.id;
 FOR p IN SELECT t.solicitante_id cid,t.data_original original UNION ALL SELECT t.destino_id,t.data_proposta LOOP
  UPDATE public.dp_folgas SET status='agendada',updated_at=now() WHERE id IN (
    SELECT fc.folga_id FROM public.dp_folgas_canceladas fc WHERE fc.company_id=t.company_id AND fc.colaborador_id=p.cid AND fc.data=p.original AND fc.origem_cancelamento='troca' AND fc.motivo='Troca aprovada (id=' || t.id || ')') AND status='cancelada';
  DELETE FROM public.dp_dia_trabalho_excepcional WHERE company_id=t.company_id AND colaborador_id=p.cid AND data=p.original AND origem='troca';
 END LOOP;
 RETURN jsonb_build_object('troca_id',t.id,'status','cancelada');
END $$;
REVOKE ALL ON FUNCTION public.dp_cancelar_troca(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dp_cancelar_troca(uuid,text) TO authenticated,service_role;