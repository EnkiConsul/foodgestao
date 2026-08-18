-- Alinha colaboradores ativos ao padrão de benefícios vigente da empresa.
-- Cargo com padrão próprio (VA desligado) mantém a exceção.
update public.dp_colaboradores set
  premio_assiduidade = true,
  premio_assiduidade_tipo = 'percentual',
  premio_assiduidade_valor = 11,
  assiduidade_criterio = 'sem_faltas',
  assiduidade_tolerancia_min = 10,
  assiduidade_max_atrasos = 3,
  assiduidade_considera_atestado = true,
  assiduidade_max_atestados = 0,
  vale_alimentacao = true,
  vale_alimentacao_valor = 24,
  vale_alimentacao_periodicidade = 'diario',
  vale_alimentacao_dias_base = 22,
  vale_alimentacao_dias_origem = 'jornada',
  vale_alimentacao_desconto_tipo = 'nenhum',
  vale_alimentacao_desconto_valor = 0
where company_id = 'b0d450a7-0a70-4322-bcdb-c3abfea196ba'
  and ativo = true
  and data_desligamento is null
  and not (unidade_id = '9d412df7-cf07-4a11-8735-af452d2d875c'
           and cargo_id = '62b05c67-1509-419f-aabd-a7e1c1d471f9');

update public.dp_colaboradores set
  premio_assiduidade = true,
  premio_assiduidade_tipo = 'percentual',
  premio_assiduidade_valor = 11,
  assiduidade_criterio = 'sem_faltas',
  assiduidade_tolerancia_min = 10,
  assiduidade_max_atrasos = 3,
  assiduidade_considera_atestado = true,
  assiduidade_max_atestados = 0,
  vale_alimentacao = false,
  vale_alimentacao_valor = null,
  vale_alimentacao_periodicidade = 'mensal',
  vale_alimentacao_dias_base = 22,
  vale_alimentacao_dias_origem = 'jornada',
  vale_alimentacao_desconto_tipo = 'nenhum',
  vale_alimentacao_desconto_valor = 0
where company_id = 'b0d450a7-0a70-4322-bcdb-c3abfea196ba'
  and ativo = true
  and data_desligamento is null
  and unidade_id = '9d412df7-cf07-4a11-8735-af452d2d875c'
  and cargo_id = '62b05c67-1509-419f-aabd-a7e1c1d471f9';