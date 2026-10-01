-- Termo de Primeiro Acesso ao Portal: aceite único por colaborador e versão.
-- Reaproveita a tabela imutável de aceites eletrônicos (dp_documento_aceites),
-- com modelo = 'termo_portal' e sem documento vinculado.
CREATE UNIQUE INDEX IF NOT EXISTS dp_documento_aceites_termo_portal_unico
  ON public.dp_documento_aceites (colaborador_id, modelo, modelo_versao)
  WHERE documento_id IS NULL
    AND modelo = 'termo_portal';