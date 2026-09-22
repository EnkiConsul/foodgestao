DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'dp_documento_tipo' AND e.enumlabel = 'aso_admissional'
  ) THEN
    ALTER TYPE public.dp_documento_tipo ADD VALUE 'aso_admissional';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'dp_documento_tipo' AND e.enumlabel = 'aso_demissional'
  ) THEN
    ALTER TYPE public.dp_documento_tipo ADD VALUE 'aso_demissional';
  END IF;
END $$;