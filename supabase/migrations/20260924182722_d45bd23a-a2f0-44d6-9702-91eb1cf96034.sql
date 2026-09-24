DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY[
    'public.dre_apply_default_mapping(uuid)',
    'public.dre_generate(uuid,date,date,text)',
    'public.dre_publish_snapshot(uuid,date,date,text,text,text,text,boolean)',
    'public.get_ia_usage_today(uuid)',
    'public.get_my_access_contexts()',
    'public.is_password_change_required()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', s);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', s);
  END LOOP;
END $$;