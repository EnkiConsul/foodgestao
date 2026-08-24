-- M6a — correção do trigger de eventos (record não atribuído quando só a ocorrência é informada)
CREATE OR REPLACE FUNCTION public.dp_conv_evento_deriva()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_conv_company uuid;
  v_conv_ocorrencia uuid;
  v_ocor_company uuid;
  v_ocor_grupo uuid;
BEGIN
  IF NEW.convocacao_id IS NOT NULL THEN
    SELECT company_id, ocorrencia_id INTO v_conv_company, v_conv_ocorrencia
      FROM public.dp_convocacoes WHERE id = NEW.convocacao_id;
    IF v_conv_company IS NULL THEN RAISE EXCEPTION 'CONVOCACAO_INEXISTENTE'; END IF;
    v_company := v_conv_company;

    IF NEW.ocorrencia_id IS NOT NULL AND v_conv_ocorrencia IS DISTINCT FROM NEW.ocorrencia_id THEN
      RAISE EXCEPTION 'EVENTO_OCORRENCIA_INCOERENTE';
    END IF;
    IF NEW.ocorrencia_id IS NULL THEN
      NEW.ocorrencia_id := v_conv_ocorrencia;
    END IF;
  END IF;

  IF NEW.ocorrencia_id IS NOT NULL THEN
    SELECT company_id, grupo_id INTO v_ocor_company, v_ocor_grupo
      FROM public.dp_convocacao_ocorrencias WHERE id = NEW.ocorrencia_id;
    IF v_ocor_company IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_INEXISTENTE'; END IF;
    IF v_company IS NULL THEN
      v_company := v_ocor_company;
    ELSIF v_company IS DISTINCT FROM v_ocor_company THEN
      RAISE EXCEPTION 'EVENTO_OCORRENCIA_INCOERENTE';
    END IF;

    IF NEW.grupo_id IS NOT NULL AND v_ocor_grupo IS DISTINCT FROM NEW.grupo_id THEN
      RAISE EXCEPTION 'EVENTO_GRUPO_INCOERENTE';
    END IF;
    IF NEW.grupo_id IS NULL THEN
      NEW.grupo_id := v_ocor_grupo;
    END IF;
  END IF;

  IF v_company IS NULL THEN
    SELECT company_id INTO v_company FROM public.dp_convocacao_grupos WHERE id = NEW.grupo_id;
    IF v_company IS NULL THEN RAISE EXCEPTION 'GRUPO_INEXISTENTE'; END IF;
  END IF;

  NEW.company_id := v_company;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.dp_conv_evento_deriva() FROM PUBLIC, anon, authenticated;