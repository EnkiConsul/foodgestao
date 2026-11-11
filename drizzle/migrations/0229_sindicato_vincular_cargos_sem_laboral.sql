-- Enquadra de uma vez, no sindicato laboral escolhido, os cargos ativos da
-- empresa que ainda não têm nenhum sindicato laboral. Nunca troca vínculos
-- existentes: cargos já enquadrados em outro laboral ficam como estão.
CREATE OR REPLACE FUNCTION public.dp_sindicato_vincular_cargos_sem_laboral(p_sindicato_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  s record;
  v_total integer;
BEGIN
  SELECT id, company_id, tipo, ativo INTO s
    FROM public.dp_sindicatos
   WHERE id = p_sindicato_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sindicato não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF auth.uid() IS NULL OR NOT (
       public.tem_permissao(s.company_id, 'dp.cadastros', 'inclusao')
       OR private.is_company_admin_or_owner(auth.uid(), s.company_id)
     ) THEN
    RAISE EXCEPTION 'Sem permissão para vincular cargos a sindicatos nesta empresa' USING ERRCODE = '42501';
  END IF;

  IF s.tipo::text <> 'laboral' THEN
    RAISE EXCEPTION 'Só sindicatos laborais representam cargos' USING ERRCODE = '22023';
  END IF;
  IF NOT s.ativo THEN
    RAISE EXCEPTION 'Sindicato inativo: reative antes de vincular cargos' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.dp_sindicato_cargos (sindicato_id, cargo_id)
  SELECT s.id, c.id
    FROM public.dp_cargos c
   WHERE c.company_id = s.company_id
     AND c.removido_em IS NULL
     AND c.ativo
     AND NOT EXISTS (
       SELECT 1
         FROM public.dp_sindicato_cargos sc
         JOIN public.dp_sindicatos s2 ON s2.id = sc.sindicato_id
        WHERE sc.cargo_id = c.id
          AND s2.tipo::text = 'laboral'
     )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END
$function$;

REVOKE ALL ON FUNCTION public.dp_sindicato_vincular_cargos_sem_laboral(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_sindicato_vincular_cargos_sem_laboral(uuid) TO authenticated, service_role;