CREATE OR REPLACE FUNCTION public.dp_folga_limite_setor_validar()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid; v_unidade uuid; v_dia smallint; v_vi date; v_vf date;
  v_setor_company uuid; v_setor_unidade uuid; v_setor_nome text;
BEGIN
  SELECT r.company_id, r.unidade_id, r.dia_semana, r.vigencia_inicio, r.vigencia_fim
    INTO v_company, v_unidade, v_dia, v_vi, v_vf
    FROM public.dp_folga_limite_regras r WHERE r.id = NEW.regra_id;

  SELECT s.company_id, s.unidade_id, s.nome INTO v_setor_company, v_setor_unidade, v_setor_nome
    FROM public.dp_setores s WHERE s.id = NEW.setor_id;

  IF v_setor_company IS NULL OR v_setor_company <> v_company THEN
    RAISE EXCEPTION 'SETOR_EMPRESA_INVALIDA: o setor pertence a outra empresa.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_unidade IS NOT NULL AND v_setor_unidade <> v_unidade THEN
    RAISE EXCEPTION 'SETOR_UNIDADE_INVALIDA: o setor pertence a outra unidade.' USING ERRCODE = 'check_violation';
  END IF;

  -- Restrição de data específica (vigência de um único dia) convive com a regra permanente.
  IF v_vi IS NOT NULL AND v_vi = v_vf THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.dp_folga_limite_regra_setores rs
      JOIN public.dp_folga_limite_regras r ON r.id = rs.regra_id
     WHERE rs.setor_id = NEW.setor_id AND rs.regra_id <> NEW.regra_id
       AND r.ativo = true AND r.company_id = v_company AND r.tipo = 'setor'
       AND NOT (r.vigencia_inicio IS NOT NULL AND r.vigencia_inicio = r.vigencia_fim)
       AND coalesce(r.unidade_id::text, '') = coalesce(v_unidade::text, '')
       AND coalesce(r.dia_semana, -1) = coalesce(v_dia, -1)
  ) THEN
    RAISE EXCEPTION 'SETOR_LIMITE_DUPLICADO: o setor % já participa de outro limite específico para este dia.', v_setor_nome
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;