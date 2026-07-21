
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.normalize_description(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT NULLIF(
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              upper(public.unaccent(coalesce(_raw, ''))),
              -- ruído de meio de pagamento
              '\y(PIX|TED|DOC|TRANSF(ERENCIA)?|PAGAMENTO|PAGTO|COMPRA|DEBITO|CREDITO|CARTAO|RECEBIDO|ENVIADO|BOLETO|SAQUE|TARIFA)\y',
              ' ', 'g'),
            -- datas dd/mm ou dd/mm/aaaa e ids nsu/doc/aut/ref/cv/tid
            '(\d{2}/\d{2}(/\d{2,4})?|\y(NSU|DOC|AUT|REF|CV|TID)\y[\s:]*\w+)',
            ' ', 'g'),
          -- CNPJ, máscaras de cartão, sequências numéricas longas
          '(\*{2,}\d+|\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}|\y\d{6,}\y)',
          ' ', 'g'),
        -- pontuação e espaços redundantes
        '[^A-Z0-9 ]+|\s{2,}', ' ', 'g')
    ), '');
$$;

REVOKE ALL ON FUNCTION private.normalize_description(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.normalize_description(text) TO authenticated, service_role;
