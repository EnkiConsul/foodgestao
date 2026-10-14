CREATE OR REPLACE FUNCTION public.dp_colab_vinculo_compensacao_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF lower(coalesce(trim(NEW.vinculo_label),'')) IN ('socio','sócio')
     OR lower(coalesce(NEW.regime::text,'clt')) NOT IN ('clt','temporario') THEN
    INSERT INTO public.dp_colaborador_compensacao (colaborador_id, company_id, usa_banco_horas, usa_compensa_feriados, updated_at)
    VALUES (NEW.id, NEW.company_id, false, false, now())
    ON CONFLICT (colaborador_id) DO UPDATE
      SET usa_banco_horas = false, usa_compensa_feriados = false, updated_at = now();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.dp_colab_vinculo_compensacao_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_colab_vinculo_compensacao_sync() TO service_role;

CREATE TRIGGER trg_dp_colab_vinculo_compensacao
AFTER INSERT OR UPDATE OF regime, vinculo_label ON public.dp_colaboradores
FOR EACH ROW EXECUTE FUNCTION public.dp_colab_vinculo_compensacao_sync();

INSERT INTO public.dp_colaborador_compensacao (colaborador_id, company_id, usa_banco_horas, usa_compensa_feriados, updated_at)
SELECT c.id, c.company_id, false, false, now() FROM public.dp_colaboradores c
WHERE lower(coalesce(trim(c.vinculo_label),'')) IN ('socio','sócio')
   OR lower(coalesce(c.regime::text,'clt')) NOT IN ('clt','temporario')
ON CONFLICT (colaborador_id) DO UPDATE SET usa_banco_horas = false, usa_compensa_feriados = false, updated_at = now();