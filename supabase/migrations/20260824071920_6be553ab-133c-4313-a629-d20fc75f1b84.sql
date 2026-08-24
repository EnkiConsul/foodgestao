CREATE OR REPLACE FUNCTION public.contact_document_key(_document text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(upper(regexp_replace(coalesce(_document, ''), '[^0-9A-Za-z]', '', 'g')), '')
$$;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_document_key_uniq
  ON public.contacts (user_id, public.contact_document_key(document))
  WHERE public.contact_document_key(document) IS NOT NULL;