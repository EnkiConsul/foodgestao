ALTER TABLE public.banks
  ADD CONSTRAINT banks_logo_url_valid_check
  CHECK (
    logo_url IS NULL
    OR (
      length(logo_url) <= 500
      AND logo_url ~* '^https?://'
      AND logo_url ~* '\.(png|jpe?g|svg|webp|gif|avif)(\?.*)?$'
    )
  );