CREATE OR REPLACE FUNCTION public._dp_preadmissao_concluir(p_preadmissao_id uuid, p_colaborador_id uuid, p_admissao date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  pa record; p record; d record;
  v_docs int := 0; v_deps int := 0; v_titular text; v_finalidade text;
  v_doc_id uuid; v_req_foto uuid;
BEGIN
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id;
  SELECT id INTO v_req_foto FROM public.dp_documento_requisitos
   WHERE company_id = pa.company_id AND codigo = 'foto_cadastro' ORDER BY created_at LIMIT 1;
  FOR p IN SELECT * FROM public.dp_preadmissao_pessoas
            WHERE preadmissao_id = pa.id AND finalidade_dependente AND removido_em IS NULL LOOP
    INSERT INTO public.dp_dependentes (company_id, colaborador_id, nome, data_nascimento, parentesco, cpf)
    VALUES (pa.company_id, p_colaborador_id, upper(p.nome), p.data_nascimento, p.parentesco, p.cpf);
    v_deps := v_deps + 1;
  END LOOP;
  FOR d IN
    SELECT dd.*, pp.nome AS pessoa_nome, pp.parentesco AS pessoa_parentesco, pp.finalidade_dependente, pp.finalidade_sesc
      FROM public.dp_preadmissao_documentos dd
      LEFT JOIN public.dp_preadmissao_pessoas pp ON pp.id = dd.pessoa_id
     WHERE dd.preadmissao_id = pa.id AND dd.substituido_em IS NULL AND dd.status <> 'recusado'
       AND (dd.pessoa_id IS NULL OR pp.removido_em IS NULL)
       AND NOT EXISTS (SELECT 1 FROM public.dp_documentos x WHERE x.file_path = dd.file_path)
  LOOP
    IF d.pessoa_id IS NULL THEN
      v_titular := upper(COALESCE(pa.dados->>'nome', pa.candidato_nome)); v_finalidade := 'TITULAR';
    ELSE
      v_titular := upper(d.pessoa_nome);
      v_finalidade := CASE WHEN d.finalidade_dependente AND d.finalidade_sesc THEN 'DEPENDENTE E SESC'
        WHEN d.finalidade_dependente THEN 'DEPENDENTE' ELSE 'SESC' END || COALESCE(' - ' || upper(d.pessoa_parentesco), '');
    END IF;
    INSERT INTO public.dp_documentos (company_id, colaborador_id, unidade_id, tipo, titulo, descricao,
      file_path, file_name, file_size, mime_type, uploaded_by, aprovacao_status, submetido_por_colaborador)
    VALUES (pa.company_id, p_colaborador_id, pa.unidade_prevista_id, 'outros_admissao'::dp_documento_tipo,
      upper(d.requisito_codigo),
      'Origem: Pré-Admissão pelo Candidato. Titular: ' || v_titular || '. Finalidade: ' || v_finalidade || '.',
      d.file_path, d.file_name, d.file_size, d.mime_type, auth.uid(),
      CASE WHEN d.status = 'aprovado' THEN 'aprovado'::dp_documento_aprovacao_status ELSE 'pendente'::dp_documento_aprovacao_status END,
      true)
    RETURNING id INTO v_doc_id;
    -- Foto 3x4/selfie do candidato vira a foto do perfil do colaborador.
    IF d.pessoa_id IS NULL AND d.requisito_codigo = 'foto_3x4' AND v_req_foto IS NOT NULL
       AND COALESCE(d.mime_type, '') LIKE 'image/%' THEN
      INSERT INTO public.dp_colaborador_documentos (company_id, colaborador_id, requisito_id, documento_id, status)
      VALUES (pa.company_id, p_colaborador_id, v_req_foto, v_doc_id, 'enviado');
    END IF;
    v_docs := v_docs + 1;
  END LOOP;
  -- colaborador_id gravado aqui dispara a cópia dos contatos de emergência.
  UPDATE public.dp_preadmissoes
     SET colaborador_id = p_colaborador_id, status = 'concluido', vinculo_admissao_em = p_admissao, updated_at = now()
   WHERE id = pa.id;
  INSERT INTO public.dp_preadmissao_eventos (preadmissao_id, company_id, evento, detalhe, actor_user_id)
  VALUES (pa.id, pa.company_id, 'concluida',
          jsonb_build_object('documentos', v_docs, 'dependentes', v_deps, 'admissao', p_admissao), auth.uid());
  RETURN jsonb_build_object('colaborador_id', p_colaborador_id, 'ja_aplicado', false,
                            'documentos', v_docs, 'dependentes', v_deps, 'admissao', p_admissao);
END;
$function$;