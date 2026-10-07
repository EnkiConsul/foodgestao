-- Troca que mistura fim de semana e dia de semana, ou que muda a folga para outra semana, sempre depende do gestor.
CREATE OR REPLACE FUNCTION private.dp_troca_exige_gestor(_data_a date, _data_b date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ((extract(dow from _data_a)::int IN (0, 6))
       <> (extract(dow from _data_b)::int IN (0, 6)))
      OR ((_data_a - (extract(isodow from _data_a)::int - 1))
       <> (_data_b - (extract(isodow from _data_b)::int - 1)));
$$;

REVOKE ALL ON FUNCTION private.dp_troca_exige_gestor(date, date) FROM PUBLIC, anon, authenticated;