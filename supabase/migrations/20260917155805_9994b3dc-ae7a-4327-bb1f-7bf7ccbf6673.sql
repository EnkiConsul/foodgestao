ALTER TABLE public.dp_unidades
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS logradouro text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS complemento text,
  ADD COLUMN IF NOT EXISTS bairro text;

COMMENT ON COLUMN public.dp_unidades.cep IS 'CEP da unidade (padrao de endereco unico do sistema).';
COMMENT ON COLUMN public.dp_unidades.logradouro IS 'Rua/avenida da unidade.';
COMMENT ON COLUMN public.dp_unidades.numero IS 'Numero; S/N quando sem numero.';
COMMENT ON COLUMN public.dp_unidades.complemento IS 'Complemento do endereco da unidade.';
COMMENT ON COLUMN public.dp_unidades.bairro IS 'Bairro da unidade.';

-- Rollback (nao destrutivo para os dados existentes em endereco/cidade/uf):
-- ALTER TABLE public.dp_unidades
--   DROP COLUMN IF EXISTS cep,
--   DROP COLUMN IF EXISTS logradouro,
--   DROP COLUMN IF EXISTS numero,
--   DROP COLUMN IF EXISTS complemento,
--   DROP COLUMN IF EXISTS bairro;