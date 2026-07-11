
CREATE OR REPLACE FUNCTION public.categories_uppercase_root_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_id IS NULL AND NEW.name IS NOT NULL THEN
    NEW.name := upper(btrim(NEW.name));
  ELSIF NEW.name IS NOT NULL THEN
    NEW.name := btrim(NEW.name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS categories_uppercase_root_name_trg ON public.categories;
CREATE TRIGGER categories_uppercase_root_name_trg
BEFORE INSERT OR UPDATE OF name, parent_id ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.categories_uppercase_root_name();

-- Normaliza registros existentes
UPDATE public.categories
SET name = upper(btrim(name))
WHERE parent_id IS NULL
  AND name IS DISTINCT FROM upper(btrim(name));
