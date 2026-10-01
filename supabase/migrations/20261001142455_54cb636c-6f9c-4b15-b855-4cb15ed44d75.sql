CREATE OR REPLACE FUNCTION public.dp_unidade_seed_feriados_nacionais(_unidade_id uuid, _company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  INSERT INTO public.dp_unidade_feriados (company_id, unidade_id, nome, tipo, dia, mes, ativo)
  SELECT _company_id, _unidade_id, v.nome, 'anual', v.dia, v.mes, true
  FROM (VALUES
    ('Confraternização Universal',1,1),('Tiradentes',21,4),('Dia do Trabalho',1,5),
    ('Independência do Brasil',7,9),('Nossa Senhora Aparecida',12,10),('Finados',2,11),
    ('Proclamação da República',15,11),('Consciência Negra',20,11),('Natal',25,12)
  ) AS v(nome, dia, mes)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.dp_unidade_feriados f
    WHERE f.unidade_id = _unidade_id AND f.tipo = 'anual' AND f.dia = v.dia AND f.mes = v.mes
  );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.dp_unidade_seed_feriados_nacionais(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_unidade_seed_feriados_nacionais(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.dp_unidade_seed_feriados_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.dp_unidade_seed_feriados_nacionais(NEW.id, NEW.company_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.dp_unidade_seed_feriados_trg() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER dp_unidade_seed_feriados_after_insert
AFTER INSERT ON public.dp_unidades
FOR EACH ROW EXECUTE FUNCTION public.dp_unidade_seed_feriados_trg();

SELECT public.dp_unidade_seed_feriados_nacionais(u.id, u.company_id) FROM public.dp_unidades u;

-- Reversão: DROP TRIGGER dp_unidade_seed_feriados_after_insert ON public.dp_unidades; DROP FUNCTION public.dp_unidade_seed_feriados_trg(); DROP FUNCTION public.dp_unidade_seed_feriados_nacionais(uuid, uuid);