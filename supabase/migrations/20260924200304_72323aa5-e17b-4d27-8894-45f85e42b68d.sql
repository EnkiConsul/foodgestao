CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome text;
BEGIN
  v_nome := NULLIF(btrim(COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'nome',
    NEW.raw_user_meta_data->>'name'
  )), '');

  -- Nunca usar e-mail sintético (login técnico) como nome de exibição.
  IF v_nome IS NULL
     AND NEW.email IS NOT NULL
     AND NEW.email NOT ILIKE '%@portal.360food.local'
     AND NEW.email NOT ILIKE '%@usuarios.aveto360.local' THEN
    v_nome := NEW.email;
  END IF;

  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, v_nome);

  RETURN NEW;
END;
$$;