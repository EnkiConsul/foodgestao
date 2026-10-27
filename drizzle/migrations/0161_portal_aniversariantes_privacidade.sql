CREATE OR REPLACE FUNCTION public.dp_portal_aniversariantes(p_competencia text DEFAULT NULL)
RETURNS TABLE(colaborador_id uuid, nome text, cargo text, unidade_id uuid, unidade_nome text, tipo text, data_evento date, anos_casa integer, faltam_dias integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_eu uuid; v_company uuid; v_unidade uuid; v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date; v_inicio date; v_fim date;
BEGIN
  v_eu := public.dp_colaborador_ativo_of(auth.uid());
  IF v_eu IS NULL THEN RETURN; END IF;
  SELECT c.company_id, c.unidade_id INTO v_company, v_unidade FROM public.dp_colaboradores c WHERE c.id = v_eu;
  IF p_competencia IS NOT NULL THEN
    IF p_competencia !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Competência inválida' USING ERRCODE = '22023'; END IF;
    v_inicio := (p_competencia || '-01')::date;
    v_fim := (v_inicio + interval '1 month - 1 day')::date;
  ELSE v_inicio := v_hoje; v_fim := v_hoje + 30; END IF;
  RETURN QUERY
  WITH pessoas AS (
    SELECT c.id, c.nome, c.cargo, c.unidade_id, u.nome AS unidade_nome, c.data_nascimento,
      greatest(c.data_admissao, coalesce(c.data_base_contagem, c.data_admissao)) AS inicio,
      c.origem_cadastro IS DISTINCT FROM 'preadmissao_rotina' AND
        (c.regime::text IN ('clt','intermitente','estagio','temporario') OR lower(trim(coalesce(c.vinculo_label,''))) IN ('socio','sócio')) AS elegivel
    FROM public.dp_colaboradores c LEFT JOIN public.dp_unidades u ON u.id=c.unidade_id AND u.company_id=c.company_id
    WHERE c.company_id=v_company AND c.ativo AND c.deleted_at IS NULL
      AND (c.id=v_eu OR (v_unidade IS NOT NULL AND c.unidade_id=v_unidade))
  ), eventos AS (
    SELECT p.id, p.nome, p.cargo, p.unidade_id, p.unidade_nome, 'nascimento'::text AS tipo, p.data_nascimento AS origem FROM pessoas p WHERE p.data_nascimento IS NOT NULL
    UNION ALL
    SELECT p.id, p.nome, p.cargo, p.unidade_id, p.unidade_nome, 'contratacao'::text, p.inicio FROM pessoas p WHERE p.elegivel AND p.inicio IS NOT NULL
  ), datas AS (
    SELECT e.*, d.dia::date AS evento FROM eventos e CROSS JOIN generate_series(v_inicio::timestamp, v_fim::timestamp, interval '1 day') d(dia)
    WHERE to_char(e.origem,'MM-DD')=to_char(d.dia,'MM-DD') AND d.dia::date>=e.origem
  )
  SELECT d.id, d.nome, d.cargo, d.unidade_id, d.unidade_nome, d.tipo, d.evento,
    CASE WHEN d.tipo='contratacao' THEN extract(year FROM age(d.evento,d.origem))::integer ELSE NULL::integer END,
    (d.evento-v_hoje)::integer FROM datas d
  WHERE d.tipo='nascimento' OR extract(year FROM age(d.evento,d.origem))>=1
  ORDER BY d.evento,d.nome,d.tipo;
END $function$;
REVOKE ALL ON FUNCTION public.dp_portal_aniversariantes(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_portal_aniversariantes(text) TO authenticated, service_role;