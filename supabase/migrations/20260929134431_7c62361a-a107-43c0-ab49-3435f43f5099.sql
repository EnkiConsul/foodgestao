CREATE OR REPLACE FUNCTION public.company_access_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.perfil NOT IN ('dono','administrador','gerente','assistente_financeiro','rh_dp','colaborador','contabilidade','visualizador','personalizado') THEN
    RAISE EXCEPTION 'Perfil inválido: %', NEW.perfil USING ERRCODE = '22023';
  END IF;

  IF TG_TABLE_NAME = 'company_members' THEN
    IF NEW.situacao NOT IN ('ativo','bloqueado') THEN
      RAISE EXCEPTION 'Situação inválida' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'company_invites' THEN
    IF NEW.full_name IS NOT NULL THEN NEW.full_name := upper(btrim(NEW.full_name)); END IF;
    IF NEW.whatsapp IS NOT NULL THEN NEW.whatsapp := regexp_replace(NEW.whatsapp, '\D', '', 'g'); END IF;
    IF NEW.invited_email IS NOT NULL THEN NEW.invited_email := nullif(lower(btrim(NEW.invited_email)), ''); END IF;
    IF NEW.invited_email IS NULL AND (NEW.whatsapp IS NULL OR length(NEW.whatsapp) NOT IN (10,11)) THEN
      RAISE EXCEPTION 'Informe um WhatsApp válido ou um e-mail' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF jsonb_typeof(NEW.modulos) <> 'object' THEN
    RAISE EXCEPTION 'Módulos inválidos' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END $function$;