-- Helper: valida se o caminho company/colaborador está liberado ao usuário
CREATE OR REPLACE FUNCTION private.dp_storage_caminho_liberado(_name text, _item text, _nivel text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_company uuid;
  v_colab uuid;
BEGIN
  v_company := try_cast_uuid(split_part(_name, '/', 1));
  IF v_company IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.tem_permissao(v_company, _item, _nivel) THEN
    RETURN false;
  END IF;

  v_colab := try_cast_uuid(split_part(_name, '/', 2));
  IF v_colab IS NULL THEN
    -- documento geral da empresa (sem colaborador no caminho)
    RETURN true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dp_colaboradores c
    WHERE c.id = v_colab AND c.company_id = v_company
  ) THEN
    RETURN false;
  END IF;

  RETURN COALESCE(private.colaborador_unidade_liberada(v_colab), false);
END;
$$;

REVOKE ALL ON FUNCTION private.dp_storage_caminho_liberado(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.dp_storage_caminho_liberado(text, text, text) TO authenticated;

-- dp-documentos: matriz dp.documentos
DROP POLICY IF EXISTS dp_doc_matriz_read ON storage.objects;
CREATE POLICY dp_doc_matriz_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'dp-documentos'
  AND private.dp_storage_caminho_liberado(name, 'dp.documentos', 'consulta')
);

DROP POLICY IF EXISTS dp_doc_matriz_insert ON storage.objects;
CREATE POLICY dp_doc_matriz_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'dp-documentos'
  AND private.dp_storage_caminho_liberado(name, 'dp.documentos', 'inclusao')
);

DROP POLICY IF EXISTS dp_doc_matriz_update ON storage.objects;
CREATE POLICY dp_doc_matriz_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'dp-documentos'
  AND private.dp_storage_caminho_liberado(name, 'dp.documentos', 'alteracao')
)
WITH CHECK (
  bucket_id = 'dp-documentos'
  AND private.dp_storage_caminho_liberado(name, 'dp.documentos', 'alteracao')
);

DROP POLICY IF EXISTS dp_doc_matriz_delete ON storage.objects;
CREATE POLICY dp_doc_matriz_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'dp-documentos'
  AND private.dp_storage_caminho_liberado(name, 'dp.documentos', 'total')
);

-- dp-disciplinar: matriz dp.ocorrencias
DROP POLICY IF EXISTS dp_disciplinar_matriz_read ON storage.objects;
CREATE POLICY dp_disciplinar_matriz_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'dp-disciplinar'
  AND private.dp_storage_caminho_liberado(name, 'dp.ocorrencias', 'consulta')
);

DROP POLICY IF EXISTS dp_disciplinar_matriz_insert ON storage.objects;
CREATE POLICY dp_disciplinar_matriz_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'dp-disciplinar'
  AND private.dp_storage_caminho_liberado(name, 'dp.ocorrencias', 'inclusao')
);

DROP POLICY IF EXISTS dp_disciplinar_matriz_update ON storage.objects;
CREATE POLICY dp_disciplinar_matriz_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'dp-disciplinar'
  AND private.dp_storage_caminho_liberado(name, 'dp.ocorrencias', 'alteracao')
)
WITH CHECK (
  bucket_id = 'dp-disciplinar'
  AND private.dp_storage_caminho_liberado(name, 'dp.ocorrencias', 'alteracao')
);

DROP POLICY IF EXISTS dp_disciplinar_matriz_delete ON storage.objects;
CREATE POLICY dp_disciplinar_matriz_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'dp-disciplinar'
  AND private.dp_storage_caminho_liberado(name, 'dp.ocorrencias', 'total')
);