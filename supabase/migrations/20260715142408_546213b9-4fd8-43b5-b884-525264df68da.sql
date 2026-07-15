
-- 1. Limpar roles dp_colaborador órfãs (sem vínculo real em dp_colaboradores)
DELETE FROM public.user_roles ur
WHERE ur.role = 'dp_colaborador'
  AND NOT EXISTS (
    SELECT 1 FROM public.dp_colaboradores c
    LEFT JOIN auth.users u ON u.id = ur.user_id
    WHERE c.ativo = true
      AND (
        c.user_id = ur.user_id
        OR (u.email IS NOT NULL AND lower(coalesce(c.email_portal, c.email)) = lower(u.email))
      )
  );

-- 2. is_dp_colaborador: só true se houver vínculo efetivo E não for owner/admin da empresa vinculada
CREATE OR REPLACE FUNCTION public.is_dp_colaborador(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.dp_colaboradores c
    LEFT JOIN auth.users u ON u.id = _user_id
    WHERE c.ativo = true
      AND (
        c.user_id = _user_id
        OR (u.email IS NOT NULL AND lower(coalesce(c.email_portal, c.email)) = lower(u.email))
      )
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
  );
$$;

-- 3. dp_colaborador_of: mesmo filtro anti-owner
CREATE OR REPLACE FUNCTION public.dp_colaborador_of(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id
  FROM public.dp_colaboradores c
  LEFT JOIN auth.users u ON u.id = _user_id
  WHERE c.ativo = true
    AND (
      c.user_id = _user_id
      OR (u.email IS NOT NULL AND lower(coalesce(c.email_portal, c.email)) = lower(u.email))
    )
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
  LIMIT 1;
$$;

-- 4. Trigger de sincronização da role dp_colaborador
CREATE OR REPLACE FUNCTION public.sync_dp_colaborador_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected_user_ids uuid[];
  uid uuid;
BEGIN
  -- Coletar user_ids afetados (resolver via user_id direto ou via e-mail)
  IF TG_OP = 'DELETE' THEN
    SELECT ARRAY(
      SELECT DISTINCT x FROM (
        SELECT OLD.user_id AS x
        UNION
        SELECT u.id FROM auth.users u
        WHERE OLD.email IS NOT NULL AND lower(u.email) = lower(coalesce(OLD.email_portal, OLD.email))
      ) s WHERE x IS NOT NULL
    ) INTO affected_user_ids;
  ELSIF TG_OP = 'INSERT' THEN
    SELECT ARRAY(
      SELECT DISTINCT x FROM (
        SELECT NEW.user_id AS x
        UNION
        SELECT u.id FROM auth.users u
        WHERE NEW.email IS NOT NULL AND lower(u.email) = lower(coalesce(NEW.email_portal, NEW.email))
      ) s WHERE x IS NOT NULL
    ) INTO affected_user_ids;
  ELSE
    SELECT ARRAY(
      SELECT DISTINCT x FROM (
        SELECT OLD.user_id AS x
        UNION SELECT NEW.user_id
        UNION SELECT u.id FROM auth.users u WHERE OLD.email IS NOT NULL AND lower(u.email) = lower(coalesce(OLD.email_portal, OLD.email))
        UNION SELECT u.id FROM auth.users u WHERE NEW.email IS NOT NULL AND lower(u.email) = lower(coalesce(NEW.email_portal, NEW.email))
      ) s WHERE x IS NOT NULL
    ) INTO affected_user_ids;
  END IF;

  IF affected_user_ids IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOREACH uid IN ARRAY affected_user_ids LOOP
    IF public.is_dp_colaborador(uid) THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (uid, 'dp_colaborador')
      ON CONFLICT (user_id, role) DO NOTHING;
    ELSE
      DELETE FROM public.user_roles
      WHERE user_id = uid AND role = 'dp_colaborador';
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_dp_colaborador_role ON public.dp_colaboradores;
CREATE TRIGGER trg_sync_dp_colaborador_role
AFTER INSERT OR UPDATE OR DELETE ON public.dp_colaboradores
FOR EACH ROW EXECUTE FUNCTION public.sync_dp_colaborador_role();
