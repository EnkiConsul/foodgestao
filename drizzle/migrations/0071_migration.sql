ALTER TABLE public.dp_colaboradores ADD COLUMN IF NOT EXISTS titular_relacao text;

CREATE OR REPLACE FUNCTION public.dp_colaborador_pagamento_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.recebe_em_especie IS TRUE OR NEW.titular_proprio IS NULL THEN
    NEW.titular_proprio := true;
  END IF;
  -- Conta/Pix de terceiro: exige nome, CPF válido (11 dígitos) e relação;
  -- o termo de autorização (art. 464 CLT) é emitido pelo app na ficha.
  IF NEW.titular_proprio IS FALSE THEN
    IF coalesce(btrim(NEW.titular_nome),'') = ''
       OR length(regexp_replace(coalesce(NEW.titular_cpf,''),'\D','','g')) <> 11
       OR coalesce(btrim(NEW.titular_relacao),'') = '' THEN
      RAISE EXCEPTION 'titular_incompleto';
    END IF;
  ELSE
    NEW.titular_nome := NULL;
    NEW.titular_cpf := NULL;
    NEW.titular_relacao := NULL;
  END IF;
  RETURN NEW;
END;
$function$;