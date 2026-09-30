INSERT INTO public.banks (slug, name, domain, logo_url, is_active)
VALUES ('bmg', 'Banco BMG', 'bancobmg.com.br', 'https://cdn.pluggy.ai/assets/connector-icons/652.svg', true)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      domain = EXCLUDED.domain,
      logo_url = EXCLUDED.logo_url,
      is_active = true;

UPDATE public.accounts
SET bank_slug = 'bmg'
WHERE bank_slug IS NULL
  AND name ILIKE '%bmg%';