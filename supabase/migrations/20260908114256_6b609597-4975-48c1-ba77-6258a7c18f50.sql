UPDATE public.dp_ferias_periodos p
SET controle_externo = true, updated_at = now()
WHERE p.controle_externo = false
  AND p.fim_aquisitivo < public.dp_ferias_corte_efetivo(p.colaborador_id);