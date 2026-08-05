-- =========================================================
-- PEDIDOS FASE 3 — Cardápio, produtos, complementos, disponibilidade
-- =========================================================

CREATE TYPE public.ped_catalog_state AS ENUM ('draft','active','paused','unavailable','archived');

-- Helper: pode editar catálogo (fail-closed, backend é a fonte da verdade)
CREATE OR REPLACE FUNCTION public.ped_can_edit_catalog(p_company_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ent jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_company_id IS NULL THEN RETURN false; END IF;
  v_ent := public.can_use_orders_module(p_company_id, 'orders.catalog');
  RETURN COALESCE((v_ent->>'allowed')::boolean, false)
     AND NOT COALESCE((v_ent->>'read_only')::boolean, true);
END; $$;

CREATE OR REPLACE FUNCTION public.ped_can_read_catalog(p_company_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ent jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_company_id IS NULL THEN RETURN false; END IF;
  v_ent := public.can_use_orders_module(p_company_id, 'orders.catalog');
  RETURN COALESCE((v_ent->>'allowed')::boolean, false);
END; $$;

REVOKE ALL ON FUNCTION public.ped_can_edit_catalog(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ped_can_read_catalog(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ped_can_edit_catalog(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ped_can_read_catalog(uuid) TO authenticated;

-- ---------------------------------------------------------
-- 1. Cardápios
-- ---------------------------------------------------------
CREATE TABLE public.ped_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.ped_units(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  channels public.ped_order_channel[] NOT NULL DEFAULT '{}',
  state public.ped_catalog_state NOT NULL DEFAULT 'draft',
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_menus_name_chk CHECK (char_length(btrim(name)) BETWEEN 1 AND 120)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ped_menus TO authenticated;
GRANT ALL ON public.ped_menus TO service_role;
ALTER TABLE public.ped_menus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "menus_read" ON public.ped_menus FOR SELECT TO authenticated
  USING (public.ped_can_read_catalog(company_id));
CREATE POLICY "menus_write" ON public.ped_menus FOR ALL TO authenticated
  USING (public.ped_can_edit_catalog(company_id))
  WITH CHECK (public.ped_can_edit_catalog(company_id));
CREATE INDEX idx_ped_menus_company ON public.ped_menus(company_id, sort_order);
CREATE UNIQUE INDEX ped_menus_default_uk ON public.ped_menus(company_id, COALESCE(unit_id,'00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_default AND state <> 'archived';

-- ---------------------------------------------------------
-- 2. Categorias do cardápio
-- ---------------------------------------------------------
CREATE TABLE public.ped_menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  menu_id uuid NOT NULL REFERENCES public.ped_menus(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  state public.ped_catalog_state NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_menu_categories_name_chk CHECK (char_length(btrim(name)) BETWEEN 1 AND 120)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ped_menu_categories TO authenticated;
GRANT ALL ON public.ped_menu_categories TO service_role;
ALTER TABLE public.ped_menu_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "menu_categories_read" ON public.ped_menu_categories FOR SELECT TO authenticated
  USING (public.ped_can_read_catalog(company_id));
CREATE POLICY "menu_categories_write" ON public.ped_menu_categories FOR ALL TO authenticated
  USING (public.ped_can_edit_catalog(company_id))
  WITH CHECK (public.ped_can_edit_catalog(company_id));
CREATE INDEX idx_ped_menu_categories_menu ON public.ped_menu_categories(menu_id, sort_order);

-- ---------------------------------------------------------
-- 3. Produtos (preços sempre em centavos — inteiro)
-- ---------------------------------------------------------
CREATE TABLE public.ped_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.ped_menu_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  internal_code text,
  image_path text,
  base_price_cents integer NOT NULL DEFAULT 0,
  prep_time_minutes integer,
  allows_notes boolean NOT NULL DEFAULT true,
  track_stock boolean NOT NULL DEFAULT false,
  stock_quantity integer,
  state public.ped_catalog_state NOT NULL DEFAULT 'draft',
  paused_until timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_products_name_chk CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  CONSTRAINT ped_products_price_chk CHECK (base_price_cents >= 0 AND base_price_cents <= 99999999),
  CONSTRAINT ped_products_prep_chk CHECK (prep_time_minutes IS NULL OR prep_time_minutes BETWEEN 1 AND 480),
  CONSTRAINT ped_products_stock_chk CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  CONSTRAINT ped_products_code_chk CHECK (internal_code IS NULL OR char_length(btrim(internal_code)) BETWEEN 1 AND 40)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ped_products TO authenticated;
GRANT ALL ON public.ped_products TO service_role;
ALTER TABLE public.ped_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_read" ON public.ped_products FOR SELECT TO authenticated
  USING (public.ped_can_read_catalog(company_id));
CREATE POLICY "products_write" ON public.ped_products FOR ALL TO authenticated
  USING (public.ped_can_edit_catalog(company_id))
  WITH CHECK (public.ped_can_edit_catalog(company_id));
CREATE INDEX idx_ped_products_category ON public.ped_products(category_id, sort_order);
CREATE INDEX idx_ped_products_company_state ON public.ped_products(company_id, state);
CREATE UNIQUE INDEX ped_products_code_uk ON public.ped_products(company_id, lower(btrim(internal_code)))
  WHERE internal_code IS NOT NULL AND archived_at IS NULL;

-- ---------------------------------------------------------
-- 4. Variações (preço absoluto)
-- ---------------------------------------------------------
CREATE TABLE public.ped_product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.ped_products(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  state public.ped_catalog_state NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_variants_name_chk CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT ped_variants_price_chk CHECK (price_cents >= 0 AND price_cents <= 99999999)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ped_product_variants TO authenticated;
GRANT ALL ON public.ped_product_variants TO service_role;
ALTER TABLE public.ped_product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "variants_read" ON public.ped_product_variants FOR SELECT TO authenticated
  USING (public.ped_can_read_catalog(company_id));
CREATE POLICY "variants_write" ON public.ped_product_variants FOR ALL TO authenticated
  USING (public.ped_can_edit_catalog(company_id))
  WITH CHECK (public.ped_can_edit_catalog(company_id));
CREATE INDEX idx_ped_variants_product ON public.ped_product_variants(product_id, sort_order);

-- ---------------------------------------------------------
-- 5. Grupos de complementos
-- ---------------------------------------------------------
CREATE TABLE public.ped_option_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.ped_products(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  min_choices integer NOT NULL DEFAULT 0,
  max_choices integer NOT NULL DEFAULT 1,
  state public.ped_catalog_state NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_groups_name_chk CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT ped_groups_choices_chk CHECK (min_choices >= 0 AND max_choices >= 1 AND min_choices <= max_choices AND max_choices <= 50),
  CONSTRAINT ped_groups_required_chk CHECK (NOT is_required OR min_choices >= 1)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ped_option_groups TO authenticated;
GRANT ALL ON public.ped_option_groups TO service_role;
ALTER TABLE public.ped_option_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "groups_read" ON public.ped_option_groups FOR SELECT TO authenticated
  USING (public.ped_can_read_catalog(company_id));
CREATE POLICY "groups_write" ON public.ped_option_groups FOR ALL TO authenticated
  USING (public.ped_can_edit_catalog(company_id))
  WITH CHECK (public.ped_can_edit_catalog(company_id));
CREATE INDEX idx_ped_groups_product ON public.ped_option_groups(product_id, sort_order);

-- ---------------------------------------------------------
-- 6. Complementos (delta de preço, pode ser negativo)
-- ---------------------------------------------------------
CREATE TABLE public.ped_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.ped_option_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL DEFAULT 0,
  max_quantity integer NOT NULL DEFAULT 1,
  state public.ped_catalog_state NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_options_name_chk CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT ped_options_price_chk CHECK (price_cents BETWEEN -99999999 AND 99999999),
  CONSTRAINT ped_options_qty_chk CHECK (max_quantity BETWEEN 1 AND 50)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ped_options TO authenticated;
GRANT ALL ON public.ped_options TO service_role;
ALTER TABLE public.ped_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "options_read" ON public.ped_options FOR SELECT TO authenticated
  USING (public.ped_can_read_catalog(company_id));
CREATE POLICY "options_write" ON public.ped_options FOR ALL TO authenticated
  USING (public.ped_can_edit_catalog(company_id))
  WITH CHECK (public.ped_can_edit_catalog(company_id));
CREATE INDEX idx_ped_options_group ON public.ped_options(group_id, sort_order);

-- ---------------------------------------------------------
-- 7. Janelas de disponibilidade (dia / horário / canal / unidade)
-- ---------------------------------------------------------
CREATE TABLE public.ped_product_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.ped_products(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.ped_units(id) ON DELETE CASCADE,
  channels public.ped_order_channel[] NOT NULL DEFAULT '{}',
  weekday smallint,
  starts_at time,
  ends_at time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_avail_weekday_chk CHECK (weekday IS NULL OR weekday BETWEEN 0 AND 6),
  CONSTRAINT ped_avail_time_chk CHECK ((starts_at IS NULL AND ends_at IS NULL) OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ped_product_availability TO authenticated;
GRANT ALL ON public.ped_product_availability TO service_role;
ALTER TABLE public.ped_product_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "avail_read" ON public.ped_product_availability FOR SELECT TO authenticated
  USING (public.ped_can_read_catalog(company_id));
CREATE POLICY "avail_write" ON public.ped_product_availability FOR ALL TO authenticated
  USING (public.ped_can_edit_catalog(company_id))
  WITH CHECK (public.ped_can_edit_catalog(company_id));
CREATE INDEX idx_ped_avail_product ON public.ped_product_availability(product_id);

-- ---------------------------------------------------------
-- 8. Preço / estado por unidade (override)
-- ---------------------------------------------------------
CREATE TABLE public.ped_product_unit_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.ped_products(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.ped_units(id) ON DELETE CASCADE,
  price_cents integer,
  state public.ped_catalog_state,
  paused_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_override_price_chk CHECK (price_cents IS NULL OR (price_cents >= 0 AND price_cents <= 99999999)),
  CONSTRAINT ped_override_uk UNIQUE (product_id, unit_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ped_product_unit_overrides TO authenticated;
GRANT ALL ON public.ped_product_unit_overrides TO service_role;
ALTER TABLE public.ped_product_unit_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "override_read" ON public.ped_product_unit_overrides FOR SELECT TO authenticated
  USING (public.ped_can_read_catalog(company_id));
CREATE POLICY "override_write" ON public.ped_product_unit_overrides FOR ALL TO authenticated
  USING (public.ped_can_edit_catalog(company_id))
  WITH CHECK (public.ped_can_edit_catalog(company_id));

-- ---------------------------------------------------------
-- Integridade: company_id derivado do pai (nunca do frontend)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ped_catalog_inherit_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_parent uuid;
BEGIN
  IF TG_TABLE_NAME = 'ped_menu_categories' THEN
    SELECT company_id INTO v_parent FROM public.ped_menus WHERE id = NEW.menu_id;
  ELSIF TG_TABLE_NAME = 'ped_products' THEN
    SELECT company_id INTO v_parent FROM public.ped_menu_categories WHERE id = NEW.category_id;
  ELSIF TG_TABLE_NAME IN ('ped_product_variants','ped_option_groups','ped_product_availability','ped_product_unit_overrides') THEN
    SELECT company_id INTO v_parent FROM public.ped_products WHERE id = NEW.product_id;
  ELSIF TG_TABLE_NAME = 'ped_options' THEN
    SELECT company_id INTO v_parent FROM public.ped_option_groups WHERE id = NEW.group_id;
  END IF;

  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'Registro pai não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  NEW.company_id := v_parent;

  IF NEW.unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ped_units u WHERE u.id = NEW.unit_id AND u.company_id = v_parent
  ) THEN
    RAISE EXCEPTION 'Unidade não pertence à empresa do cardápio.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.ped_menu_validate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ped_units u WHERE u.id = NEW.unit_id AND u.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Unidade não pertence à empresa informada.' USING ERRCODE = '42501';
  END IF;
  IF NEW.state = 'archived' AND NEW.archived_at IS NULL THEN NEW.archived_at := now(); END IF;
  IF NEW.state <> 'archived' THEN NEW.archived_at := NULL; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.ped_catalog_sync_archive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.state = 'archived' AND NEW.archived_at IS NULL THEN NEW.archived_at := now(); END IF;
  IF NEW.state <> 'archived' THEN NEW.archived_at := NULL; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.ped_catalog_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

CREATE TRIGGER ped_menus_validate BEFORE INSERT OR UPDATE ON public.ped_menus
  FOR EACH ROW EXECUTE FUNCTION public.ped_menu_validate();
CREATE TRIGGER ped_menu_categories_company BEFORE INSERT OR UPDATE ON public.ped_menu_categories
  FOR EACH ROW EXECUTE FUNCTION public.ped_catalog_inherit_company();
CREATE TRIGGER ped_menu_categories_archive BEFORE INSERT OR UPDATE ON public.ped_menu_categories
  FOR EACH ROW EXECUTE FUNCTION public.ped_catalog_sync_archive();
CREATE TRIGGER ped_products_company BEFORE INSERT OR UPDATE ON public.ped_products
  FOR EACH ROW EXECUTE FUNCTION public.ped_catalog_inherit_company();
CREATE TRIGGER ped_products_archive BEFORE INSERT OR UPDATE ON public.ped_products
  FOR EACH ROW EXECUTE FUNCTION public.ped_catalog_sync_archive();
CREATE TRIGGER ped_variants_company BEFORE INSERT OR UPDATE ON public.ped_product_variants
  FOR EACH ROW EXECUTE FUNCTION public.ped_catalog_inherit_company();
CREATE TRIGGER ped_groups_company BEFORE INSERT OR UPDATE ON public.ped_option_groups
  FOR EACH ROW EXECUTE FUNCTION public.ped_catalog_inherit_company();
CREATE TRIGGER ped_options_company BEFORE INSERT OR UPDATE ON public.ped_options
  FOR EACH ROW EXECUTE FUNCTION public.ped_catalog_inherit_company();
CREATE TRIGGER ped_avail_company BEFORE INSERT OR UPDATE ON public.ped_product_availability
  FOR EACH ROW EXECUTE FUNCTION public.ped_catalog_inherit_company();
CREATE TRIGGER ped_override_company BEFORE INSERT OR UPDATE ON public.ped_product_unit_overrides
  FOR EACH ROW EXECUTE FUNCTION public.ped_catalog_inherit_company();

CREATE TRIGGER ped_menus_touch BEFORE UPDATE ON public.ped_menus FOR EACH ROW EXECUTE FUNCTION public.ped_catalog_touch();
CREATE TRIGGER ped_menu_categories_touch BEFORE UPDATE ON public.ped_menu_categories FOR EACH ROW EXECUTE FUNCTION public.ped_catalog_touch();
CREATE TRIGGER ped_products_touch BEFORE UPDATE ON public.ped_products FOR EACH ROW EXECUTE FUNCTION public.ped_catalog_touch();
CREATE TRIGGER ped_variants_touch BEFORE UPDATE ON public.ped_product_variants FOR EACH ROW EXECUTE FUNCTION public.ped_catalog_touch();
CREATE TRIGGER ped_groups_touch BEFORE UPDATE ON public.ped_option_groups FOR EACH ROW EXECUTE FUNCTION public.ped_catalog_touch();
CREATE TRIGGER ped_options_touch BEFORE UPDATE ON public.ped_options FOR EACH ROW EXECUTE FUNCTION public.ped_catalog_touch();
CREATE TRIGGER ped_avail_touch BEFORE UPDATE ON public.ped_product_availability FOR EACH ROW EXECUTE FUNCTION public.ped_catalog_touch();
CREATE TRIGGER ped_override_touch BEFORE UPDATE ON public.ped_product_unit_overrides FOR EACH ROW EXECUTE FUNCTION public.ped_catalog_touch();

-- Produto arquivado é histórico: não pode ser excluído
CREATE OR REPLACE FUNCTION public.ped_products_block_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.archived_at IS NOT NULL OR OLD.state = 'archived' THEN
    RAISE EXCEPTION 'Produto arquivado é histórico e não pode ser excluído.' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END; $$;
CREATE TRIGGER ped_products_no_delete BEFORE DELETE ON public.ped_products
  FOR EACH ROW EXECUTE FUNCTION public.ped_products_block_delete();

-- ---------------------------------------------------------
-- RPC: reordenação atômica (evita concorrência)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ped_reorder_catalog(p_kind text, p_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_i integer := 0; v_id uuid;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN RETURN 0; END IF;

  IF p_kind = 'category' THEN
    SELECT company_id INTO v_company FROM public.ped_menu_categories WHERE id = p_ids[1] FOR UPDATE;
  ELSIF p_kind = 'product' THEN
    SELECT company_id INTO v_company FROM public.ped_products WHERE id = p_ids[1] FOR UPDATE;
  ELSIF p_kind = 'variant' THEN
    SELECT company_id INTO v_company FROM public.ped_product_variants WHERE id = p_ids[1] FOR UPDATE;
  ELSIF p_kind = 'group' THEN
    SELECT company_id INTO v_company FROM public.ped_option_groups WHERE id = p_ids[1] FOR UPDATE;
  ELSIF p_kind = 'option' THEN
    SELECT company_id INTO v_company FROM public.ped_options WHERE id = p_ids[1] FOR UPDATE;
  ELSE
    RAISE EXCEPTION 'Tipo inválido para reordenação: %.', p_kind USING ERRCODE = '22023';
  END IF;

  IF v_company IS NULL THEN RAISE EXCEPTION 'Registro não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.ped_can_edit_catalog(v_company) THEN
    RAISE EXCEPTION 'Sem permissão para editar o cardápio.' USING ERRCODE = '42501';
  END IF;

  FOREACH v_id IN ARRAY p_ids LOOP
    v_i := v_i + 1;
    IF p_kind = 'category' THEN
      UPDATE public.ped_menu_categories SET sort_order = v_i WHERE id = v_id AND company_id = v_company;
    ELSIF p_kind = 'product' THEN
      UPDATE public.ped_products SET sort_order = v_i WHERE id = v_id AND company_id = v_company;
    ELSIF p_kind = 'variant' THEN
      UPDATE public.ped_product_variants SET sort_order = v_i WHERE id = v_id AND company_id = v_company;
    ELSIF p_kind = 'group' THEN
      UPDATE public.ped_option_groups SET sort_order = v_i WHERE id = v_id AND company_id = v_company;
    ELSIF p_kind = 'option' THEN
      UPDATE public.ped_options SET sort_order = v_i WHERE id = v_id AND company_id = v_company;
    END IF;
  END LOOP;
  RETURN v_i;
END; $$;
REVOKE ALL ON FUNCTION public.ped_reorder_catalog(text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ped_reorder_catalog(text, uuid[]) TO authenticated;

-- ---------------------------------------------------------
-- RPC: duplicar produto (mesma empresa; opcionalmente outra categoria/unidade)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ped_duplicate_product(p_product_id uuid, p_target_category_id uuid DEFAULT NULL, p_new_name text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_src public.ped_products;
  v_cat uuid;
  v_new_id uuid;
  v_group RECORD;
  v_new_group uuid;
BEGIN
  SELECT * INTO v_src FROM public.ped_products WHERE id = p_product_id;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.ped_can_edit_catalog(v_src.company_id) THEN
    RAISE EXCEPTION 'Sem permissão para editar o cardápio.' USING ERRCODE = '42501';
  END IF;

  v_cat := COALESCE(p_target_category_id, v_src.category_id);
  IF NOT EXISTS (SELECT 1 FROM public.ped_menu_categories c WHERE c.id = v_cat AND c.company_id = v_src.company_id) THEN
    RAISE EXCEPTION 'Categoria destino não pertence à mesma empresa.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ped_products (
    company_id, category_id, name, description, base_price_cents, prep_time_minutes,
    allows_notes, track_stock, image_path, state, sort_order
  ) VALUES (
    v_src.company_id, v_cat,
    left(COALESCE(nullif(btrim(p_new_name), ''), v_src.name || ' (cópia)'), 160),
    v_src.description, v_src.base_price_cents, v_src.prep_time_minutes,
    v_src.allows_notes, v_src.track_stock, v_src.image_path, 'draft', v_src.sort_order + 1
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.ped_product_variants (product_id, name, price_cents, is_default, state, sort_order, company_id)
  SELECT v_new_id, name, price_cents, is_default, state, sort_order, v_src.company_id
    FROM public.ped_product_variants WHERE product_id = p_product_id;

  FOR v_group IN SELECT * FROM public.ped_option_groups WHERE product_id = p_product_id LOOP
    INSERT INTO public.ped_option_groups (product_id, name, is_required, min_choices, max_choices, state, sort_order, company_id)
    VALUES (v_new_id, v_group.name, v_group.is_required, v_group.min_choices, v_group.max_choices, v_group.state, v_group.sort_order, v_src.company_id)
    RETURNING id INTO v_new_group;
    INSERT INTO public.ped_options (group_id, name, description, price_cents, max_quantity, state, sort_order, company_id)
    SELECT v_new_group, name, description, price_cents, max_quantity, state, sort_order, v_src.company_id
      FROM public.ped_options WHERE group_id = v_group.id;
  END LOOP;

  INSERT INTO public.ped_product_availability (product_id, unit_id, channels, weekday, starts_at, ends_at, company_id)
  SELECT v_new_id, unit_id, channels, weekday, starts_at, ends_at, v_src.company_id
    FROM public.ped_product_availability WHERE product_id = p_product_id;

  RETURN v_new_id;
END; $$;
REVOKE ALL ON FUNCTION public.ped_duplicate_product(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ped_duplicate_product(uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------
-- RPC: duplicar cardápio inteiro para outra unidade da mesma empresa
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ped_duplicate_menu_to_unit(p_menu_id uuid, p_target_unit_id uuid, p_new_name text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_src public.ped_menus; v_new_menu uuid; v_cat RECORD; v_new_cat uuid; v_prod RECORD;
BEGIN
  SELECT * INTO v_src FROM public.ped_menus WHERE id = p_menu_id;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'Cardápio não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.ped_can_edit_catalog(v_src.company_id) THEN
    RAISE EXCEPTION 'Sem permissão para editar o cardápio.' USING ERRCODE = '42501';
  END IF;
  IF p_target_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ped_units u WHERE u.id = p_target_unit_id AND u.company_id = v_src.company_id
  ) THEN
    RAISE EXCEPTION 'Unidade destino não pertence à mesma empresa.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ped_menus (company_id, unit_id, name, description, channels, state, sort_order)
  VALUES (v_src.company_id, p_target_unit_id,
          left(COALESCE(nullif(btrim(p_new_name), ''), v_src.name || ' (cópia)'), 120),
          v_src.description, v_src.channels, 'draft', v_src.sort_order + 1)
  RETURNING id INTO v_new_menu;

  FOR v_cat IN SELECT * FROM public.ped_menu_categories WHERE menu_id = p_menu_id AND state <> 'archived' ORDER BY sort_order LOOP
    INSERT INTO public.ped_menu_categories (menu_id, name, description, state, sort_order, company_id)
    VALUES (v_new_menu, v_cat.name, v_cat.description, v_cat.state, v_cat.sort_order, v_src.company_id)
    RETURNING id INTO v_new_cat;
    FOR v_prod IN SELECT id FROM public.ped_products WHERE category_id = v_cat.id AND state <> 'archived' ORDER BY sort_order LOOP
      PERFORM public.ped_duplicate_product(v_prod.id, v_new_cat, NULL);
    END LOOP;
  END LOOP;

  RETURN v_new_menu;
END; $$;
REVOKE ALL ON FUNCTION public.ped_duplicate_menu_to_unit(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ped_duplicate_menu_to_unit(uuid, uuid, text) TO authenticated;