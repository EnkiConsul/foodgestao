DO $m$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.admin_cliente360_lista'::regproc);
  d := replace(d, '''desde'', b.created_at', '''desde'', b.added_at');
  d := replace(d, 'AND NOT EXISTS (SELECT 1 FROM profiles p0 WHERE false)', '');
  EXECUTE d;
END $m$;