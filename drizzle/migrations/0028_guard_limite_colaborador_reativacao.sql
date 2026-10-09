CREATE OR REPLACE FUNCTION public.dp_guard_limite_colaborador()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_c uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.ativo AND OLD.desligado_em IS NULL THEN
    RETURN NULL; -- já contava na franquia
  END IF;
  IF NOT (NEW.ativo AND NEW.desligado_em IS NULL
          AND public.assinatura_limite_excedido(NEW.company_id, 'pessoas', 'colaboradores')) THEN
    RETURN NULL;
  END IF;
  IF public.checkout_v2_mode() <> 'v2' THEN
    RAISE EXCEPTION 'Limite do plano atingido: não é possível incluir mais colaboradores. Contrate um adicional para ampliar o limite.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public._dp_excedente_pode_gerir(NEW.company_id) THEN
    RAISE EXCEPTION 'EXCEDENTE_SEM_PERMISSAO' USING ERRCODE = 'check_violation';
  END IF;
  SELECT id INTO v_c FROM public.dp_colaborador_excedente_ciencias
   WHERE company_id = NEW.company_id AND user_id = auth.uid() AND usado_em IS NULL
     AND created_at > now() - interval '15 minutes'
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF v_c IS NULL THEN
    RAISE EXCEPTION 'EXCEDENTE_CONFIRMACAO_NECESSARIA' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.dp_colaborador_excedente_ciencias SET usado_em = now(), colaborador_id = NEW.id WHERE id = v_c;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS trg_dp_guard_limite_colaborador_reativ ON public.dp_colaboradores;
CREATE CONSTRAINT TRIGGER trg_dp_guard_limite_colaborador_reativ
AFTER UPDATE OF ativo, desligado_em ON public.dp_colaboradores
DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW
WHEN (NEW.ativo AND NEW.desligado_em IS NULL AND NOT (OLD.ativo AND OLD.desligado_em IS NULL))
EXECUTE FUNCTION public.dp_guard_limite_colaborador();