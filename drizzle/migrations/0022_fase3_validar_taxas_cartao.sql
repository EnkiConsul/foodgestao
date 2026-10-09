CREATE OR REPLACE FUNCTION public.billing_v2_cartao_taxas_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v jsonb := NEW.value; f jsonb; ate int; pct numeric; ult int := 1; n int;
BEGIN
  IF NEW.key <> 'billing_v2_cartao_taxas' THEN RETURN NEW; END IF;
  IF jsonb_typeof(v) <> 'object' OR jsonb_typeof(v->'faixas') <> 'array' OR jsonb_typeof(v->'fixo_cents') <> 'number' THEN
    RAISE EXCEPTION 'Taxas do cartão inválidas: informe as faixas e o valor fixo.' USING ERRCODE = '22023';
  END IF;
  IF (v->>'fixo_cents')::numeric <> trunc((v->>'fixo_cents')::numeric) OR (v->>'fixo_cents')::numeric NOT BETWEEN 0 AND 1000 THEN
    RAISE EXCEPTION 'Valor fixo deve ficar entre R$ 0,00 e R$ 10,00.' USING ERRCODE = '22023';
  END IF;
  n := jsonb_array_length(v->'faixas');
  IF n = 0 THEN RAISE EXCEPTION 'Informe ao menos uma faixa.' USING ERRCODE = '22023'; END IF;
  FOR f IN SELECT e FROM jsonb_array_elements(v->'faixas') e ORDER BY (e->>'ate')::numeric LOOP
    IF jsonb_typeof(f->'ate') <> 'number' OR jsonb_typeof(f->'pct') <> 'number' THEN
      RAISE EXCEPTION 'Cada faixa precisa de parcelas e taxa numéricas.' USING ERRCODE = '22023';
    END IF;
    IF (f->>'ate')::numeric <> trunc((f->>'ate')::numeric) THEN RAISE EXCEPTION 'Faixas vão de 2x a 12x.' USING ERRCODE = '22023'; END IF;
    ate := (f->>'ate')::int; pct := (f->>'pct')::numeric;
    IF ate < 2 OR ate > 12 THEN RAISE EXCEPTION 'Faixas vão de 2x a 12x.' USING ERRCODE = '22023'; END IF;
    IF ate = ult THEN RAISE EXCEPTION 'Duas faixas com o mesmo número de parcelas.' USING ERRCODE = '22023'; END IF;
    IF pct < 0 OR pct > 20 THEN RAISE EXCEPTION 'Taxa deve ficar entre 0%% e 20%%.' USING ERRCODE = '22023'; END IF;
    ult := ate;
  END LOOP;
  IF ult <> 12 THEN RAISE EXCEPTION 'A última faixa precisa ir até 12x.' USING ERRCODE = '22023'; END IF;
  NEW.value := jsonb_build_object('faixas', (SELECT jsonb_agg(jsonb_build_object('ate',(e->>'ate')::int,'pct',(e->>'pct')::numeric) ORDER BY (e->>'ate')::int) FROM jsonb_array_elements(v->'faixas') e), 'fixo_cents', (v->>'fixo_cents')::int);
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.billing_v2_cartao_taxas_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_billing_v2_cartao_taxas_guard ON public.system_parameters;
CREATE TRIGGER trg_billing_v2_cartao_taxas_guard BEFORE INSERT OR UPDATE ON public.system_parameters
  FOR EACH ROW EXECUTE FUNCTION public.billing_v2_cartao_taxas_guard();