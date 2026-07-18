ALTER TABLE public.dp_avisos ADD COLUMN IF NOT EXISTS colaborador_id uuid REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'dp_avisos_escopo_check') THEN
    ALTER TABLE public.dp_avisos DROP CONSTRAINT dp_avisos_escopo_check;
  END IF;
END $$;

ALTER TABLE public.dp_avisos ADD CONSTRAINT dp_avisos_escopo_check
  CHECK (escopo IN ('todos','unidade','cargo','colaborador'));