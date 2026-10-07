ALTER TABLE public.dp_avisos ADD COLUMN IF NOT EXISTS publico jsonb;
ALTER TABLE public.dp_avisos DROP CONSTRAINT IF EXISTS dp_avisos_escopo_check;
ALTER TABLE public.dp_avisos ADD CONSTRAINT dp_avisos_escopo_check
  CHECK (escopo = ANY (ARRAY['todos','unidade','cargo','colaborador','segmentado']));

CREATE OR REPLACE FUNCTION private.dp_aviso_alcanca(
  _uid uuid, _company_id uuid, _escopo text, _unidade_id uuid, _cargo_id uuid,
  _colaborador_id uuid, _publico jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN coalesce(_escopo,'todos') = 'todos' THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.dp_colaboradores c
      WHERE c.user_id = _uid AND c.company_id = _company_id AND c.deleted_at IS NULL
        AND CASE _escopo
          WHEN 'unidade' THEN c.unidade_id = _unidade_id
          WHEN 'cargo' THEN c.cargo_id = _cargo_id
          WHEN 'colaborador' THEN c.id = _colaborador_id
          WHEN 'segmentado' THEN (
            (_publico ? 'colaboradores' AND jsonb_array_length(_publico->'colaboradores') > 0
              AND (_publico->'colaboradores') ? c.id::text)
            OR (
              (coalesce(jsonb_array_length(_publico->'unidades'),0) + coalesce(jsonb_array_length(_publico->'cargos'),0)
               + coalesce(jsonb_array_length(_publico->'setores'),0) + coalesce(jsonb_array_length(_publico->'sindicatos'),0)
               + coalesce(jsonb_array_length(_publico->'regimes'),0)) > 0
              AND (coalesce(jsonb_array_length(_publico->'unidades'),0) = 0 OR (_publico->'unidades') ? coalesce(c.unidade_id::text,''))
              AND (coalesce(jsonb_array_length(_publico->'cargos'),0) = 0 OR (_publico->'cargos') ? coalesce(c.cargo_id::text,''))
              AND (coalesce(jsonb_array_length(_publico->'setores'),0) = 0 OR (_publico->'setores') ? coalesce(c.setor_id::text,''))
              AND (coalesce(jsonb_array_length(_publico->'sindicatos'),0) = 0 OR (_publico->'sindicatos') ? coalesce(c.sindicato_id::text,''))
              AND (coalesce(jsonb_array_length(_publico->'regimes'),0) = 0 OR (_publico->'regimes') ? coalesce(c.regime::text,''))
            )
          )
          ELSE false
        END
    )
  END;
$$;
REVOKE ALL ON FUNCTION private.dp_aviso_alcanca(uuid,uuid,text,uuid,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.dp_aviso_alcanca(uuid,uuid,text,uuid,uuid,uuid,jsonb) TO authenticated, service_role;

DROP POLICY IF EXISTS dp_avisos_read ON public.dp_avisos;
CREATE POLICY dp_avisos_read ON public.dp_avisos FOR SELECT USING (
  private.is_company_member((SELECT auth.uid()), company_id)
  OR (private.is_dp_colaborador_of_company((SELECT auth.uid()), company_id)
      AND private.dp_aviso_alcanca((SELECT auth.uid()), company_id, escopo, unidade_id, cargo_id, colaborador_id, publico))
);