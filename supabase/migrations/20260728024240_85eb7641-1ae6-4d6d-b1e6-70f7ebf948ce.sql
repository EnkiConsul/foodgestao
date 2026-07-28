
-- 1) Partições de audit_logs: replicar policies restritivas de negação
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS rel
      FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
     WHERE i.inhparent = 'public.audit_logs'::regclass
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', r.rel);
    EXECUTE format('DROP POLICY IF EXISTS "Deny insert on audit logs" ON %s', r.rel);
    EXECUTE format('DROP POLICY IF EXISTS "Deny update on audit logs" ON %s', r.rel);
    EXECUTE format('DROP POLICY IF EXISTS "Deny delete on audit logs" ON %s', r.rel);
    EXECUTE format('CREATE POLICY "Deny insert on audit logs" ON %s AS RESTRICTIVE FOR INSERT TO public WITH CHECK (false)', r.rel);
    EXECUTE format('CREATE POLICY "Deny update on audit logs" ON %s AS RESTRICTIVE FOR UPDATE TO public USING (false) WITH CHECK (false)', r.rel);
    EXECUTE format('CREATE POLICY "Deny delete on audit logs" ON %s AS RESTRICTIVE FOR DELETE TO public USING (false)', r.rel);
  END LOOP;
END $$;

-- 2) dp_colaboradores.user_id: apenas admins podem definir/alterar
CREATE OR REPLACE FUNCTION public.dp_colab_guard_user_id_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  -- service_role e chamadas sem contexto de auth (jobs, triggers em cascata) não sofrem restrição.
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NULL THEN
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
      RETURN NEW;
    END IF;
  END IF;

  v_is_admin := is_super_admin(v_actor)
             OR private.is_company_admin_or_owner(v_actor, NEW.company_id)
             OR EXISTS (
                  SELECT 1 FROM public.companies c
                   WHERE c.id = NEW.company_id AND c.user_id = v_actor
                );

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'not_authorized_to_link_colaborador_user'
      USING ERRCODE = '42501',
            HINT = 'Somente administradores da empresa podem definir ou alterar o vínculo (user_id) do colaborador.';
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.dp_colab_guard_user_id_link() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_dp_colab_guard_user_id_link_ins ON public.dp_colaboradores;
DROP TRIGGER IF EXISTS trg_dp_colab_guard_user_id_link_upd ON public.dp_colaboradores;

CREATE TRIGGER trg_dp_colab_guard_user_id_link_ins
BEFORE INSERT ON public.dp_colaboradores
FOR EACH ROW EXECUTE FUNCTION public.dp_colab_guard_user_id_link();

CREATE TRIGGER trg_dp_colab_guard_user_id_link_upd
BEFORE UPDATE OF user_id ON public.dp_colaboradores
FOR EACH ROW EXECUTE FUNCTION public.dp_colab_guard_user_id_link();
