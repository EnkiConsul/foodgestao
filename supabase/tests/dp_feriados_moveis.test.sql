-- Execute against an isolated database with migration 0140 applied.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    (2026, DATE '2026-02-17', DATE '2026-04-03', DATE '2026-06-04'),
    (2027, DATE '2027-02-09', DATE '2027-03-26', DATE '2027-05-27'),
    (2028, DATE '2028-02-29', DATE '2028-04-14', DATE '2028-06-15'),
    (2038, DATE '2038-03-09', DATE '2038-04-23', DATE '2038-06-24'),
    (2100, DATE '2100-02-09', DATE '2100-03-26', DATE '2100-05-27')
  ) AS v(ano, carnaval, sexta, corpus) LOOP
    IF public.dp_feriado_movel_data('carnaval', r.ano) IS DISTINCT FROM r.carnaval THEN RAISE EXCEPTION 'Carnaval incorreto em %', r.ano; END IF;
    IF public.dp_feriado_movel_data('sexta_feira_santa', r.ano) IS DISTINCT FROM r.sexta THEN RAISE EXCEPTION 'Sexta-feira Santa incorreta em %', r.ano; END IF;
    IF public.dp_feriado_movel_data('corpus_christi', r.ano) IS DISTINCT FROM r.corpus THEN RAISE EXCEPTION 'Corpus Christi incorreto em %', r.ano; END IF;
  END LOOP;
END $$;