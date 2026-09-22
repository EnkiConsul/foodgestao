CREATE OR REPLACE FUNCTION public.dp_colaborador_pagamento_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Só conta de titularidade do próprio colaborador. Conta de terceiro deixou
  -- de ser aceita; os campos seguem na tabela apenas por histórico.
  IF NEW.titular_proprio IS FALSE THEN
    RAISE EXCEPTION 'titular_terceiro_nao_permitido';
  END IF;
  IF NEW.recebe_em_especie IS TRUE THEN
    NEW.titular_proprio := true;
  END IF;
  IF NEW.titular_proprio IS NULL THEN
    NEW.titular_proprio := true;
  END IF;
  RETURN NEW;
END;
$function$;