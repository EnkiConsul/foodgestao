
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE e.enumlabel = 'pos_pagamento'
      AND t.typname = (
        SELECT format_type(atttypid, NULL)
        FROM pg_attribute
        WHERE attrelid = 'public.dp_bloqueio_regras'::regclass AND attname = 'tipo'
      )
  ) THEN
    -- discover enum type name dynamically
    EXECUTE format(
      'ALTER TYPE %s ADD VALUE IF NOT EXISTS ''pos_pagamento''',
      (SELECT format_type(atttypid, NULL) FROM pg_attribute
       WHERE attrelid = 'public.dp_bloqueio_regras'::regclass AND attname = 'tipo')
    );
  END IF;
END$$;
