-- P0.4 — Pessoas 360°: rotinas internas fechadas + titularidade da empresa blindada
-- Idempotente. Apenas permissões, uma função auxiliar e uma policy.
-- Não altera dados de clientes e não executa nenhuma rotina de negócio.

-- 1) Rotinas exclusivamente internas (nenhum chamador em src/ ou supabase/functions/):
--    fila de importação em lote, geração automática de escala, atribuição
--    automática de folgas (cron/rotinas internas) e duas funções de trigger.
--    Passam a ser executáveis somente por service_role (Edge/cron) e pelo dono.
DO $$
DECLARE
  fns text[] := ARRAY[
    'public.dp_bulk_increment_processed(uuid)',
    'public.dp_escala_auto_gerar(uuid, date)',
    'public.dp_escala_auto_gerar_todas()',
    'public.dp_folga_autoatribuir_todas()',
    'public.dp_folga_autoatribuir_competencia(uuid, uuid, date)',
    'public.dp_folga_autoatribuir_manual(uuid, uuid, date)',
    'public.dp_folga_autoatribuicao_previa(uuid, uuid, date)',
    'public.dp_escala_item_validar_setor()',
    'public.dp_folgas_validar_unificado()'
  ];
  f text;
BEGIN
  FOREACH f IN ARRAY fns LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END IF;
  END LOOP;
END $$;

-- 2) Titularidade da empresa: além dos triggers BEFORE UPDATE já existentes,
--    a própria policy passa a impedir que um admin não-dono altere companies.user_id.
CREATE OR REPLACE FUNCTION private.company_owner_snapshot(_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT c.user_id FROM public.companies c WHERE c.id = _company_id $$;

REVOKE ALL ON FUNCTION private.company_owner_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.company_owner_snapshot(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Company admins can update companies" ON public.companies;
CREATE POLICY "Company admins can update companies"
ON public.companies FOR UPDATE TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  OR private.is_company_admin_or_owner((SELECT auth.uid()), id)
)
WITH CHECK (
  (
    (SELECT auth.uid()) = user_id
    OR private.is_company_admin_or_owner((SELECT auth.uid()), id)
  )
  AND (
    user_id = private.company_owner_snapshot(id)
    OR (SELECT auth.uid()) = private.company_owner_snapshot(id)
    OR public.is_super_admin((SELECT auth.uid()))
  )
);

-- 3) Verificação fail-closed: aborta se alguma rotina interna voltar a ficar aberta.
DO $$
DECLARE aberta text;
BEGIN
  SELECT string_agg(f, ', ') INTO aberta
  FROM unnest(ARRAY[
    'public.dp_bulk_increment_processed(uuid)',
    'public.dp_escala_auto_gerar(uuid, date)',
    'public.dp_escala_auto_gerar_todas()',
    'public.dp_folga_autoatribuir_todas()',
    'public.dp_folga_autoatribuir_competencia(uuid, uuid, date)',
    'public.dp_folga_autoatribuir_manual(uuid, uuid, date)',
    'public.dp_folga_autoatribuicao_previa(uuid, uuid, date)'
  ]) f
  WHERE to_regprocedure(f) IS NOT NULL
    AND (has_function_privilege('authenticated', f, 'EXECUTE')
      OR has_function_privilege('anon', f, 'EXECUTE'));
  IF aberta IS NOT NULL THEN
    RAISE EXCEPTION 'P0.4: rotinas internas ainda executáveis por anon/authenticated: %', aberta;
  END IF;
END $$;
