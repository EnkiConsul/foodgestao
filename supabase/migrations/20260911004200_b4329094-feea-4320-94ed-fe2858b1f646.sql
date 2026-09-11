CREATE OR REPLACE FUNCTION public.dp_upper_nomes_colaborador()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  new.nome := upper(btrim(regexp_replace(coalesce(new.nome, ''), '\s+', ' ', 'g')));
  new.nome_mae := nullif(upper(btrim(regexp_replace(coalesce(new.nome_mae, ''), '\s+', ' ', 'g'))), '');
  new.nome_pai := nullif(upper(btrim(regexp_replace(coalesce(new.nome_pai, ''), '\s+', ' ', 'g'))), '');
  new.nome_social := nullif(upper(btrim(regexp_replace(coalesce(new.nome_social, ''), '\s+', ' ', 'g'))), '');
  RETURN new;
END;
$$;