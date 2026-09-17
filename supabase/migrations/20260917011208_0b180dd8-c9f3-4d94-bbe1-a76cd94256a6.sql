DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'dp_notificacao_tipo' AND e.enumlabel = 'preadmissao_enviada'
  ) THEN
    ALTER TYPE public.dp_notificacao_tipo ADD VALUE 'preadmissao_enviada';
  END IF;
END $$;