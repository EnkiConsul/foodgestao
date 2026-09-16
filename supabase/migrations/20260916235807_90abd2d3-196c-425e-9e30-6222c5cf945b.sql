-- Proibições legais absolutas deixam de depender da configuração da empresa.
-- A chave `exige_validacao_menor` continua valendo apenas para as regras que
-- admitem norma coletiva (intervalo e prorrogação de jornada).
CREATE OR REPLACE FUNCTION public.dp_validar_jornada_menor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  j record;
  v_exige boolean;
  v_idade int;
  v_entrada time;
  v_saida time;
  v_insalubre boolean := false;
  v_frac boolean;
BEGIN
  SELECT exige_validacao_menor INTO v_exige
    FROM public.dp_config_dp WHERE company_id = NEW.company_id;
  v_exige := COALESCE(v_exige, true);

  SELECT * INTO c FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
  IF c.data_nascimento IS NULL THEN
    RETURN NEW;
  END IF;

  v_idade := EXTRACT(YEAR FROM age(COALESCE(NEW.inicio, CURRENT_DATE), c.data_nascimento))::int;
  IF v_idade >= 18 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO j FROM public.dp_jornadas WHERE id = NEW.jornada_id;

  -- ── Proibições absolutas: sempre aplicadas, sem configuração que desligue ──
  IF v_idade < 14 THEN
    RAISE EXCEPTION 'Proibido qualquer trabalho a menor de 14 anos (Art. 7º, XXXIII CF).'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_idade < 16 AND NOT COALESCE(c.aprendiz, false) THEN
    RAISE EXCEPTION 'Proibido vincular jornada a menor de 16 anos, salvo na condição de aprendiz (Art. 403 CLT).'
      USING ERRCODE = 'check_violation';
  END IF;

  v_entrada := COALESCE(NEW.horario_entrada_override, j.horario_entrada);
  v_saida   := COALESCE(NEW.horario_saida_override, j.horario_saida);

  IF j.turno = 'noturno'
     OR (v_entrada IS NOT NULL AND (v_entrada >= time '22:00' OR v_entrada < time '05:00'))
     OR (v_saida IS NOT NULL AND (v_saida > time '22:00' OR v_saida <= time '05:00'))
     OR (v_entrada IS NOT NULL AND v_saida IS NOT NULL AND v_saida < v_entrada) THEN
    RAISE EXCEPTION 'Proibido trabalho noturno (22h às 5h) para menor de 18 anos (Art. 404 CLT / Art. 67 ECA).'
      USING ERRCODE = 'check_violation';
  END IF;

  IF c.cargo_id IS NOT NULL THEN
    SELECT COALESCE(insalubre_periculoso, false) INTO v_insalubre
      FROM public.dp_cargos WHERE id = c.cargo_id;
  END IF;
  IF COALESCE(v_insalubre, false) THEN
    RAISE EXCEPTION 'Proibido vincular menor de 18 anos a cargo insalubre ou perigoso (Art. 405 CLT).'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Regras que admitem norma coletiva: seguem a configuração da empresa ──
  IF NOT v_exige THEN
    RETURN NEW;
  END IF;

  v_frac := COALESCE(j.permite_intervalo_fracionado, false);
  IF v_frac THEN
    RAISE EXCEPTION 'O intervalo de menor de 18 anos não pode ser reduzido ou fracionado (Art. 411 a 413 CLT).'
      USING ERRCODE = 'check_violation';
  END IF;

  IF COALESCE(c.aprendiz, false) THEN
    IF COALESCE(c.fundamental_concluido, true) = false AND j.carga_horaria_diaria > 6 THEN
      RAISE EXCEPTION 'Aprendiz sem ensino fundamental concluído: jornada máxima de 6h por dia.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF j.carga_horaria_diaria > 8 THEN
      RAISE EXCEPTION 'Contrato de aprendizagem: jornada máxima de 8h por dia.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF j.carga_horaria_diaria > 8 THEN
    RAISE EXCEPTION 'Prorrogação de jornada para menor de 18 anos exige convenção ou acordo coletivo (Art. 413 CLT).'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;