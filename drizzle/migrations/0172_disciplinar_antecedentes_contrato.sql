ALTER TABLE public.dp_registros_disciplinares ADD COLUMN IF NOT EXISTS reincidencia_texto text, ADD COLUMN IF NOT EXISTS antecedentes_ids uuid[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS antecedentes_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE OR REPLACE FUNCTION public.dp_disciplinar_antecedentes_gravar(p_registro_id uuid, p_ids uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_reg public.dp_registros_disciplinares; v_admissao date; v_r record; v_text text := ''; v_snapshot jsonb := '[]'; v_ids uuid[]; v_count integer := 0;
BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
SELECT * INTO v_reg FROM public.dp_registros_disciplinares WHERE id=p_registro_id FOR UPDATE;
IF v_reg.id IS NULL OR v_reg.removido_em IS NOT NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
IF NOT (private.is_company_admin_or_owner(auth.uid(),v_reg.company_id) OR EXISTS(SELECT 1 FROM public.companies WHERE id=v_reg.company_id AND user_id=auth.uid())) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v_ids FROM unnest(coalesce(p_ids,'{}'::uuid[])) x;
IF cardinality(v_ids)>20 THEN RAISE EXCEPTION 'DISC_ANTECEDENTES_LIMITE'; END IF;
SELECT data_admissao INTO v_admissao FROM public.dp_colaboradores WHERE id=v_reg.colaborador_id AND company_id=v_reg.company_id FOR SHARE;
IF cardinality(v_ids)>0 AND (v_admissao IS NULL OR v_reg.data<v_admissao OR v_reg.tipo NOT IN ('advertencia_escrita','suspensao')) THEN RAISE EXCEPTION 'DISC_ANTECEDENTE_INVALIDO'; END IF;
FOR v_r IN SELECT * FROM public.dp_registros_disciplinares WHERE id=ANY(v_ids) ORDER BY data,id FOR SHARE LOOP
IF v_r.id=v_reg.id OR v_r.company_id<>v_reg.company_id OR v_r.colaborador_id<>v_reg.colaborador_id OR v_r.removido_em IS NOT NULL OR v_r.data<v_admissao OR v_r.data>=v_reg.data OR v_r.tipo NOT IN ('advertencia_verbal','advertencia_escrita','suspensao') OR (v_r.tipo<>'advertencia_verbal' AND v_r.via_assinada_path IS NULL) THEN RAISE EXCEPTION 'DISC_ANTECEDENTE_INVALIDO'; END IF;
v_count:=v_count+1;
v_text:=v_text || CASE WHEN v_text='' THEN '' ELSE E'\n' END || 'Consta no histórico do contrato atual ' || CASE v_r.tipo WHEN 'advertencia_verbal' THEN 'orientação e advertência verbal' WHEN 'advertencia_escrita' THEN 'advertência escrita' ELSE 'suspensão disciplinar' END || ' em ' || to_char(v_r.data,'DD/MM/YYYY') || ', pelo motivo: ' || v_r.motivo || '.';
v_snapshot:=v_snapshot || jsonb_build_array(jsonb_build_object('id',v_r.id,'tipo',v_r.tipo,'data',v_r.data,'motivo',v_r.motivo,'via_assinada_path',v_r.via_assinada_path,'data_admissao',v_admissao));
END LOOP;
IF v_count<>cardinality(v_ids) THEN RAISE EXCEPTION 'DISC_ANTECEDENTE_INVALIDO'; END IF;
UPDATE public.dp_registros_disciplinares SET antecedentes_ids=v_ids,antecedentes_snapshot=v_snapshot,reincidencia_texto=nullif(v_text,'') WHERE id=p_registro_id;
END $$;
REVOKE ALL ON FUNCTION public.dp_disciplinar_antecedentes_gravar(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dp_disciplinar_antecedentes_gravar(uuid,uuid[]) TO service_role;
CREATE OR REPLACE FUNCTION public.dp_registro_disciplinar_registrar_documentado(p_colaborador_id uuid,p_tipo text,p_data date,p_motivo text,p_descricao text DEFAULT NULL,p_suspensao_dias integer DEFAULT NULL,p_antecedentes_ids uuid[] DEFAULT '{}') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
v_id:=public.dp_registro_disciplinar_registrar(p_colaborador_id,p_tipo,p_data,p_motivo,p_descricao,p_suspensao_dias);
PERFORM public.dp_disciplinar_antecedentes_gravar(v_id,p_antecedentes_ids);
RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.dp_registro_disciplinar_registrar_documentado(uuid,text,date,text,text,integer,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dp_registro_disciplinar_registrar_documentado(uuid,text,date,text,text,integer,uuid[]) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.dp_registro_disciplinar_corrigir_documentado(p_registro_id uuid,p_colaborador_id uuid DEFAULT NULL,p_tipo text DEFAULT NULL,p_data date DEFAULT NULL,p_motivo text DEFAULT NULL,p_descricao text DEFAULT NULL,p_suspensao_dias integer DEFAULT NULL,p_antecedentes_ids uuid[] DEFAULT '{}') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_path text;
BEGIN
SELECT via_assinada_path INTO v_path FROM public.dp_registros_disciplinares WHERE id=p_registro_id FOR UPDATE;
IF v_path IS NOT NULL THEN RAISE EXCEPTION 'DISC_VIA_ASSINADA_PRESERVADA'; END IF;
PERFORM public.dp_registro_disciplinar_corrigir(p_registro_id,p_colaborador_id,p_tipo,p_data,p_motivo,p_descricao,p_suspensao_dias);
PERFORM public.dp_disciplinar_antecedentes_gravar(p_registro_id,p_antecedentes_ids);
END $$;
REVOKE ALL ON FUNCTION public.dp_registro_disciplinar_corrigir_documentado(uuid,uuid,text,date,text,text,integer,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dp_registro_disciplinar_corrigir_documentado(uuid,uuid,text,date,text,text,integer,uuid[]) TO authenticated,service_role;
COMMENT ON COLUMN public.dp_registros_disciplinares.antecedentes_snapshot IS 'Server-validated immutable historical context snapshot, regenerated only on explicit unsigned record correction; not a new sanction.';