CREATE OR REPLACE FUNCTION public.audit_row_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  _company uuid;
  _colab uuid;
  _unid uuid;
  _ignored text[] := ARRAY[
    'updated_at','created_at','updated_by','last_sync_at','synced_at',
    'sincronizado_em','atualizado_em','saldo_atual','current_balance','search_vector',
    'bank_balance','bank_balance_at','bank_balance_source'
  ];
BEGIN
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
      IF NOT (_k = ANY(_ignored))
         AND COALESCE(_row->>_k, '') IS DISTINCT FROM COALESCE(_old->>_k, '') THEN
        _changed := _changed || jsonb_build_object(_k, true);
      END IF;
    END LOOP;
    IF _changed = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
  END IF;

  BEGIN
    _company := NULLIF(COALESCE(_row->>'company_id', _row->>'empresa_id'), '')::uuid;
  EXCEPTION WHEN others THEN
    _company := NULL;
  END;

  IF _company IS NULL THEN
    BEGIN
      _colab := NULLIF(_row->>'colaborador_id', '')::uuid;
      _unid := NULLIF(_row->>'unidade_id', '')::uuid;
    EXCEPTION WHEN others THEN
      _colab := NULL; _unid := NULL;
    END;
    IF _colab IS NOT NULL THEN
      SELECT c.company_id INTO _company FROM public.dp_colaboradores c WHERE c.id = _colab;
    END IF;
    IF _company IS NULL AND _unid IS NOT NULL THEN
      SELECT u.company_id INTO _company FROM public.dp_unidades u WHERE u.id = _unid;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'companies' AND _company IS NULL THEN
    BEGIN
      _company := NULLIF(_entity_id, '')::uuid;
    EXCEPTION WHEN others THEN
      _company := NULL;
    END;
  END IF;

  IF _uid IS NOT NULL THEN
    SELECT full_name INTO _user_name FROM public.profiles WHERE user_id = _uid LIMIT 1;
  END IF;

  INSERT INTO public.audit_logs (user_id, user_name, action, entity_type, entity_id, details, company_id, actor_kind)
  VALUES (
    _uid,
    CASE WHEN _uid IS NULL THEN 'Sistema / Importação' ELSE _user_name END,
    TG_TABLE_NAME || '_' || _op,
    TG_TABLE_NAME,
    NULLIF(_entity_id, ''),
    jsonb_strip_nulls(jsonb_build_object(
      'target_name', _name,
      'company_id', _company::text,
      'changed_fields', CASE WHEN TG_OP = 'UPDATE' THEN (SELECT jsonb_agg(key) FROM jsonb_each(_changed)) ELSE NULL END
    )),
    _company,
    CASE WHEN _uid IS NULL THEN 'system' ELSE 'user' END
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;