ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'admissao';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'identidade';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'residencia';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'bancario';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'cnh';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'crlv';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'seguro_veiculo';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'dependente';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'ficha_registro';

ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS pis_nit text,
  ADD COLUMN IF NOT EXISTS veiculo_proprio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cnh_categoria text,
  ADD COLUMN IF NOT EXISTS cnh_validade date,
  ADD COLUMN IF NOT EXISTS estado_civil text;

ALTER TABLE public.dp_cargos
  ADD COLUMN IF NOT EXISTS exige_cnh boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cnh_categoria_minima text,
  ADD COLUMN IF NOT EXISTS exige_epi boolean NOT NULL DEFAULT false;