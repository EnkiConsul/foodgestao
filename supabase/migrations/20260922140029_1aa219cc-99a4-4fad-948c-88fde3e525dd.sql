CREATE OR REPLACE FUNCTION private.dp_doc_service_role()
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT coalesce(
    current_setting('request.jwt.claim.role', true) = 'service_role'
    OR nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role' = 'service_role',
    false
  );
$$;

CREATE OR REPLACE FUNCTION private.dp_doc_campos_conferir(_dados jsonb, _permitidos text[])
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE k text;
BEGIN
  FOR k IN SELECT jsonb_object_keys(coalesce(_dados, '{}'::jsonb)) LOOP
    IF NOT (k = ANY(_permitidos)) THEN
      RAISE EXCEPTION 'DOC_CAMPO_NAO_PERMITIDO:%', k;
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION private.dp_doc_service_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dp_doc_campos_conferir(jsonb, text[]) FROM PUBLIC;
