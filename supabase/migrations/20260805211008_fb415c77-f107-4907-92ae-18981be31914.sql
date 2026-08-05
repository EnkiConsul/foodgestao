CREATE OR REPLACE FUNCTION public.ped_catalog_inherit_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent uuid;
  v_unit uuid;
  v_row jsonb;
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

  v_row := to_jsonb(NEW);
  IF v_row ? 'unit_id' AND v_row->>'unit_id' IS NOT NULL THEN
    v_unit := (v_row->>'unit_id')::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.ped_units u WHERE u.id = v_unit AND u.company_id = v_parent
    ) THEN
      RAISE EXCEPTION 'Unidade não pertence à empresa do cardápio.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;