-- 1) Garante no máximo um vínculo de portal ativo por usuário
CREATE UNIQUE INDEX IF NOT EXISTS dp_colaboradores_user_ativo_uniq
  ON public.dp_colaboradores (user_id)
  WHERE user_id IS NOT NULL AND ativo = true;

-- 2) Fail closed: se houver mais de um candidato, não resolve nenhum colaborador
CREATE OR REPLACE FUNCTION public.dp_colaborador_of(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH candidatos AS (
    SELECT c.id
    FROM public.dp_colaboradores c
    WHERE (c.ativo = true OR (c.acesso_portal_ate IS NOT NULL AND c.acesso_portal_ate >= CURRENT_DATE))
      AND c.user_id = _user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.companies co
        WHERE co.id = c.company_id AND co.user_id = _user_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.company_members m
        WHERE m.company_id = c.company_id
          AND m.user_id = _user_id
          AND m.role IN ('owner','admin')
      )
    LIMIT 2
  )
  SELECT id FROM candidatos
  WHERE (SELECT count(*) FROM candidatos) = 1;
$function$;

CREATE OR REPLACE FUNCTION public.dp_colaborador_ativo_of(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH candidatos AS (
    SELECT c.id
    FROM public.dp_colaboradores c
    WHERE c.ativo = true
      AND c.user_id = _user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.companies co
        WHERE co.id = c.company_id AND co.user_id = _user_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.company_members m
        WHERE m.company_id = c.company_id
          AND m.user_id = _user_id
          AND m.role IN ('owner','admin')
      )
    LIMIT 2
  )
  SELECT id FROM candidatos
  WHERE (SELECT count(*) FROM candidatos) = 1;
$function$;