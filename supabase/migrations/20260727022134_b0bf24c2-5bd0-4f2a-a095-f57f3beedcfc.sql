CREATE OR REPLACE FUNCTION public.dp_config_dp_seed_on_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_comercio boolean;
BEGIN
  -- Padrão do produto (food service): tratar como comércio salvo indicação contrária.
  SELECT COALESCE(s.nome IS NULL OR s.nome <> 'Outro', true)
    INTO v_comercio
    FROM public.segmentos s WHERE s.id = NEW.segmento_id;
  v_comercio := COALESCE(v_comercio, true);

  INSERT INTO public.dp_config_dp (company_id, setor_comercio, periodicidade_domingo, folgas_fds_por_mes)
  VALUES (NEW.id, v_comercio, CASE WHEN v_comercio THEN 3 ELSE 7 END, 1)
  ON CONFLICT (company_id) DO NOTHING;

  RETURN NEW;
END;
$function$;