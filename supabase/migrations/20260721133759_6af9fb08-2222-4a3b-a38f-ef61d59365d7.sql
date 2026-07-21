
CREATE OR REPLACE FUNCTION private.normalize_description(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public', 'pg_catalog'
AS $$
  WITH s0 AS (
    SELECT upper(public.unaccent(coalesce(_raw, ''))) AS v
  ),
  s1 AS (
    -- colapsa siglas: S.A. -> SA
    SELECT regexp_replace(v, '([A-Z])\.(?=[A-Z](\y|\.))', '\1', 'g') AS v FROM s0
  ),
  s2 AS (
    -- ruído de meio de pagamento
    SELECT regexp_replace(
      v,
      '\y(PIX|TED|DOC|TRANSF(ERENCIA)?|PAGAMENTO|PAGTO|COMPRA|DEBITO|CREDITO|CARTAO|RECEBIDO|ENVIADO|BOLETO|SAQUE|TARIFA)\y',
      ' ', 'g'
    ) AS v FROM s1
  ),
  s3 AS (
    -- CNPJ, máscara de cartão, números longos ANTES de datas
    SELECT regexp_replace(
      v,
      '(\*{2,}\d+|\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}|\y\d{6,}\y)',
      ' ', 'g'
    ) AS v FROM s2
  ),
  s4 AS (
    -- datas dd/mm(/aaaa) e identificadores NSU/DOC/AUT/REF/CV/TID + token
    SELECT regexp_replace(
      v,
      '(\d{2}/\d{2}(/\d{2,4})?|\y(NSU|DOC|AUT|REF|CV|TID)\y[\s:]*\w+)',
      ' ', 'g'
    ) AS v FROM s3
  ),
  s5 AS (
    -- pontuação e espaços redundantes
    SELECT regexp_replace(v, '[^A-Z0-9 ]+|\s{2,}', ' ', 'g') AS v FROM s4
  )
  SELECT NULLIF(btrim(regexp_replace(v, '\s{2,}', ' ', 'g')), '') FROM s5;
$$;

REVOKE ALL ON FUNCTION private.normalize_description(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.normalize_description(text) TO authenticated, service_role;
