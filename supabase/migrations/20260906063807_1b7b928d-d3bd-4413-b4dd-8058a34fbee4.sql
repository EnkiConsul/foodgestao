-- M29 (Rotina do dia) — registro manual de trabalho de colaborador cadastrado.
-- Rollback: remover valor do enum não é possível; bastaria dropar a coluna colaborador_id,
-- o índice e restaurar o CHECK NOT NULL de nome.

ALTER TYPE public.dp_pessoa_avulsa_tipo ADD VALUE IF NOT EXISTS 'registro_manual';

ALTER TABLE public.dp_pessoas_avulsas
  ADD COLUMN IF NOT EXISTS colaborador_id uuid REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE;

ALTER TABLE public.dp_pessoas_avulsas ALTER COLUMN nome DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.dp_pessoas_avulsas'::regclass
       AND conname = 'dp_pessoas_avulsas_nome_check'
  ) THEN
    ALTER TABLE public.dp_pessoas_avulsas DROP CONSTRAINT dp_pessoas_avulsas_nome_check;
  END IF;
END $$;

-- Exatamente uma origem: nome livre (pessoa não cadastrada) XOR colaborador cadastrado.
ALTER TABLE public.dp_pessoas_avulsas
  ADD CONSTRAINT dp_pessoas_avulsas_origem_check CHECK (
    (colaborador_id IS NULL AND nome IS NOT NULL AND btrim(nome) <> '')
    OR (colaborador_id IS NOT NULL AND nome IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_dp_pessoas_avulsas_colaborador
  ON public.dp_pessoas_avulsas (colaborador_id);

CREATE OR REPLACE FUNCTION public.dp_pessoas_avulsas_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_conflito integer;
BEGIN
  IF NEW.data_fim < NEW.data_inicio THEN
    RAISE EXCEPTION 'A data final não pode ser anterior à data inicial';
  END IF;

  IF NEW.tipo = 'registro_manual' THEN
    IF NEW.colaborador_id IS NULL THEN
      RAISE EXCEPTION 'Registro manual exige um colaborador cadastrado';
    END IF;
    NEW.cobre_colaborador_id := NULL;
    NEW.nome := NULL;

    SELECT count(*) INTO v_conflito
      FROM public.dp_pessoas_avulsas p
     WHERE p.company_id = NEW.company_id
       AND p.colaborador_id = NEW.colaborador_id
       AND p.tipo = 'registro_manual'
       AND p.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
       AND p.data_inicio <= NEW.data_fim
       AND p.data_fim >= NEW.data_inicio;
    IF COALESCE(v_conflito, 0) > 0 THEN
      RAISE EXCEPTION 'Este colaborador já tem registro manual de trabalho nesse período';
    END IF;
  ELSIF NEW.colaborador_id IS NOT NULL THEN
    RAISE EXCEPTION 'Somente o registro manual pode ser vinculado a um colaborador cadastrado';
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;