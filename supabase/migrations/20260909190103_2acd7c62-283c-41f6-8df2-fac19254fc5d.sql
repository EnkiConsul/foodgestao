CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _user_name text;
  _row jsonb;
  _old jsonb;
  _entity_id text;
  _name text;
  _op text;
  _changed jsonb := '{}'::jsonb;
  _k text;
BEGIN
  IF _uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    _op := 'created';
    _row := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    _op := 'updated';
    _row := to_jsonb(NEW);
    _old := to_jsonb(OLD);
  ELSE
    _op := 'deleted';
    _row := to_jsonb(OLD);
  END IF;

  _entity_id := COALESCE(_row->>'id', '');
  _name := COALESCE(
    _row->>'nome', _row->>'name', _row->>'nome_completo', _row->>'titulo',
    _row->>'descricao', _row->>'description', _row->>'email', NULL
  );

  IF TG_OP = 'UPDATE' THEN
    FOR _k IN SELECT key FROM jsonb_each(_row) LOOP
      IF _k NOT IN ('updated_at', 'created_at')
         AND COALESCE(_row->>_k, '') IS DISTINCT FROM COALESCE(_old->>_k, '') THEN
        _changed := _changed || jsonb_build_object(_k, true);
      END IF;
    END LOOP;
    IF _changed = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT full_name INTO _user_name FROM public.profiles WHERE user_id = _uid LIMIT 1;

  INSERT INTO public.audit_logs (user_id, user_name, action, entity_type, entity_id, details)
  VALUES (
    _uid,
    _user_name,
    TG_TABLE_NAME || '_' || _op,
    TG_TABLE_NAME,
    NULLIF(_entity_id, ''),
    jsonb_strip_nulls(jsonb_build_object(
      'target_name', _name,
      'company_id', _row->>'company_id',
      'changed_fields', CASE WHEN TG_OP = 'UPDATE' THEN (SELECT jsonb_agg(key) FROM jsonb_each(_changed)) ELSE NULL END
    ))
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'dp_colaboradores','dp_cargos','dp_setores','dp_unidades','dp_turnos','dp_jornadas','dp_sindicatos',
    'dp_documentos','dp_folgas','dp_ferias_gozos','dp_trocas','dp_convocacoes','dp_escalas',
    'company_invites','company_members','company_modules',
    'credit_cards','budgets','cost_centers','payment_methods','tags'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON public.%1$I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
         FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', t);
    END IF;
  END LOOP;
END $$;