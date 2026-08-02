CREATE OR REPLACE FUNCTION public.dp_config_dp_seed_on_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_comercio boolean;
BEGIN
  BEGIN
    -- Padrão do produto (food service): tratar como comércio salvo indicação contrária.
    SELECT COALESCE(s.nome IS NULL OR s.nome <> 'Outro', true)
      INTO v_comercio
      FROM public.segmentos s WHERE s.id = NEW.segmento_id;
    v_comercio := COALESCE(v_comercio, true);

    -- Não usar ON CONFLICT (company_id): os únicos índices únicos são PARCIAIS
    -- (WHERE unidade_id IS NULL / IS NOT NULL) e não servem como árbitro.
    IF NOT EXISTS (
      SELECT 1 FROM public.dp_config_dp
       WHERE company_id = NEW.id AND unidade_id IS NULL
    ) THEN
      INSERT INTO public.dp_config_dp (company_id, setor_comercio, periodicidade_domingo, folgas_fds_por_mes)
      VALUES (NEW.id, v_comercio, CASE WHEN v_comercio THEN 3 ELSE 7 END, 1);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'dp_config_dp_seed_on_company failed for company %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;