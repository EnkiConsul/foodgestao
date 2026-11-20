BEGIN;
SET LOCAL search_path = public, extensions;

DO $guard$
BEGIN
  IF inet_server_port() <> 5432 OR EXISTS (SELECT 1 FROM auth.users)
      OR EXISTS (SELECT 1 FROM public.companies) THEN
    RAISE EXCEPTION 'A semeadura exige um Supabase descartável vazio.';
  END IF;
END
$guard$;

CREATE TEMP TABLE fixture_users (label text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
INSERT INTO fixture_users
SELECT label, gen_random_uuid() FROM unnest(ARRAY['a', 'b', 'c', 'd']) AS label;

INSERT INTO auth.users
  (id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change_token_new, email_change)
SELECT id, 'authenticated', 'authenticated', 'ci-' || label || '@example.invalid',
       crypt(:'fixture_password', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', 'Usuário Sintético ' || upper(label)),
       now(), now(), '', '', '', ''
FROM fixture_users;

CREATE TEMP TABLE fixture_companies (label text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
WITH created AS (
  INSERT INTO public.companies (user_id, name, profile_type, status_tenant)
  SELECT id, 'CI Empresa ' || CASE label WHEN 'a' THEN '1' ELSE '2' END, 'empresarial', 'ativa'
  FROM fixture_users WHERE label IN ('a', 'd')
  RETURNING id, user_id
)
INSERT INTO fixture_companies
SELECT CASE u.label WHEN 'a' THEN '1' ELSE '2' END, c.id
FROM created c JOIN fixture_users u ON u.id = c.user_id;

INSERT INTO public.company_members (company_id, user_id, role)
SELECT c.id, u.id,
       (CASE u.label WHEN 'b' THEN 'member' WHEN 'c' THEN 'viewer' ELSE 'owner' END)::company_role
FROM fixture_users u
JOIN fixture_companies c ON c.label = CASE WHEN u.label = 'd' THEN '2' ELSE '1' END
ON CONFLICT (company_id, user_id) DO UPDATE SET role = excluded.role;

DO $verify$
BEGIN
  IF (SELECT count(*) FROM fixture_users) <> 4 OR
     (SELECT count(*) FROM fixture_companies) <> 2 OR
     (SELECT count(*) FROM public.company_members m
      JOIN fixture_users u ON u.id = m.user_id
      JOIN fixture_companies c ON c.id = m.company_id) <> 4 THEN
    RAISE EXCEPTION 'As contas, empresas e vínculos sintéticos não foram criados.';
  END IF;
END
$verify$;
COMMIT;
