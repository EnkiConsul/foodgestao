# Remuneração: valor do cargo, adicional por tempo de serviço e salário-família

Três frentes, na ordem em que serão entregues.

## 1. Valor do salário ao lado do cargo (correção)

Na ficha da Hanna a lista mostra "PIZZAIOLO" sem valor, mas mostra "ATENDENTE — R$ 1.750,00" e "MOTOQUEIRO — R$ 1.750,00".

Causa confirmada nos dados: essa lista lê um campo antigo de salário gravado no próprio cargo, preenchido em Atendente e Motoqueiro e vazio em Pizzaiolo. O salário do Pizzaiolo existe no lugar certo — piso de R$ 1.750,00 do sindicato patronal SINDTUR, vigente desde 18/11/2025, e a unidade da Hanna é vinculada ao SINDTUR.

Correção:
- A lista passa a mostrar o salário resolvido pela regra oficial: ajuste da unidade do colaborador, senão piso do patronal daquela unidade, considerando a data de admissão.
- Sem piso para o patronal da unidade, aparece "piso a cadastrar" em vez de nada.
- Sem unidade escolhida ainda, aparece a faixa de pisos do cargo (ex.: "R$ 1.750,00" ou "R$ 1.750,00 a R$ 1.900,00").
- O campo antigo deixa de ser fonte de exibição em qualquer tela (nada é apagado do banco).

## 2. Adicional por tempo de serviço (anuênio, triênio, quinquênio)

Hoje não existe nada disso no sistema. Vai ser uma regra cadastrada, não um valor digitado por colaborador.

- Novo cadastro "Adicional por tempo de serviço", dentro de Cadastros do Pessoas 360°, com: tipo do ciclo (anual, bienal, trienal, quinquenal), percentual por ciclo, base de cálculo (salário base do colaborador ou piso do cargo), limite de ciclos (ex.: máximo 6 triênios), forma de acúmulo (soma simples dos ciclos ou percentual único do último ciclo), início de vigência e escopo: empresa, sindicato laboral, unidade ou cargo. O escopo mais específico vence.
- Na aba Remuneração do colaborador aparece um bloco "Tempo de serviço" mostrando: anos completos desde a admissão, quantos ciclos completou, percentual aplicado, valor em reais e qual regra foi usada. Valor calculado automaticamente, com possibilidade de travar um valor manual quando o caso for atípico (com aviso de que sai da regra).
- Na folha, entra como provento próprio "Adicional por tempo de serviço", entrando na base de INSS, FGTS e IRRF, aparecendo no holerite e nos relatórios.
- Alerta de aniversário de ciclo: quando um colaborador completar um novo ciclo no mês, aparece pendência avisando que o adicional muda, antes do fechamento da folha.

## 3. Dependentes e salário-família

Também não existe hoje: há apenas um número de dependentes para o Imposto de Renda, sem nome, idade ou documentos.

- Nova aba "Dependentes" no cadastro do colaborador, com: nome, data de nascimento, parentesco (filho, enteado, tutelado, cônjuge, outro), CPF, se tem deficiência, e duas marcações independentes: conta para o Imposto de Renda e conta para o salário-família. A contagem de dependentes do IR passa a ser calculada a partir dessa lista, em vez de digitada.
- O salário-família é pago por filho ou equiparado de até 14 anos, ou com deficiência em qualquer idade, para quem tem remuneração até o teto legal. A cota por dependente e o teto de remuneração ficam em Configurações do Pessoas 360°, com vigência, porque mudam a cada ano — assim a atualização anual não exige mexer no sistema.
- Na folha, entra como provento "Salário-família", fora da base de INSS, FGTS e IRRF (é reembolso previdenciário), com o cálculo mostrando quantos dependentes geraram cota.
- Rotina de alerta (usa as pendências e o sino já existentes):
  - comprovante de vacinação pendente para dependente de até 6 anos (checagem anual);
  - comprovante de frequência escolar pendente para dependente de 7 a 14 anos (checagem semestral);
  - dependente que completa 14 anos no mês: o benefício cessa, confirmar baixa;
  - remuneração do colaborador passou do teto: o benefício deve ser suspenso;
  - **atualização anual obrigatória da tabela**: toda virada de ano, se a cota e o teto cadastrados ainda tiverem vigência do ano anterior, aparece pendência para o gestor atualizar os valores (reaparece até ser resolvida, com destaque maior quando já houver folha do ano novo em aberto);
  - laudo de deficiência com validade vencida.
  Os documentos usam o cadastro de documentos do colaborador que já existe, com marcação de tipo e data de validade.
- Bloqueio de fechamento: a folha avisa (sem travar) quando há dependente com comprovação vencida recebendo cota, para o RH decidir.

## Detalhes técnicos

**Cargo (frente 1)**
- `src/components/dp/ColaboradorFormDialog.tsx` (~1283-1291): substituir `salarioReferencia(c)` por rótulo derivado dos pisos. Carregar `useDpCargoSalarios()` sem `cargoId`, agrupar por `cargo_id` e resolver com `salarioCargoNaUnidade(linhas, form.unidade_id, patronalUnidade?.id, form.data_admissao, { aceitarFuturo: true })` — mesma chamada de `refSalario`, para rótulo e bloco de enquadramento nunca divergirem.
- Extrair `rotuloSalarioCargo` para `src/lib/dp/cargoSalarios.ts`, compartilhado com `salarioResumo` de `src/pages/dp/DpCargos.tsx`; testes em `src/lib/dp/__tests__/cargoSalarios.test.ts` (piso único, faixa por patronais distintos, ajuste de unidade, piso futuro aceito, sem piso).
- `salarioReferencia` em `src/lib/dp/cargos.ts` continua só para a comparação "um cargo = um salário" (já recebe o valor resolvido via `cargoParaComparacao`).

**Banco (frentes 2 e 3)**
- `public.dp_adicionais_tempo_servico`: company_id, escopo (`empresa|sindicato|unidade|cargo`) + sindicato_id/unidade_id/cargo_id opcionais, ciclo_meses, percentual_por_ciclo, base (`salario_base|piso_cargo`), max_ciclos, acumula boolean, vigencia_inicio/fim, observacao. GRANTs (`select` para authenticated, `all` para service_role), RLS: leitura por membro da empresa, escrita por admin/owner (`private.is_company_member` / `private.is_company_admin_or_owner`, padrão das demais tabelas do DP).
- `public.dp_dependentes`: company_id, colaborador_id, nome, data_nascimento, parentesco, cpf, deficiencia boolean, laudo_validade date, conta_irrf boolean, conta_salario_familia boolean, cessado_em date, observacao. Mesmos GRANTs/RLS; leitura extra do próprio colaborador via `dp_colaborador_of`.
- `dp_config_dp`: novas colunas `salario_familia_cota`, `salario_familia_teto`, `salario_familia_vigencia` (ano/data de referência da tabela cadastrada), `salario_familia_confirmado_em` (para dispensar a pendência quando o gestor confirma que os valores seguem válidos) e `adicional_tempo_servico_ativo`, herdadas por unidade como as demais configs.
- `dp_colaboradores`: colunas `adicional_tempo_servico_manual` (numeric, opcional) e `adicional_tempo_servico_override` (boolean). `dependentes_irrf` permanece, mas passa a ser recalculado por trigger a partir de `dp_dependentes` quando houver registros.
- Novos tipos de lançamento na folha (`dp_folha_tipo` ou tabela de rubricas, seguindo o que já existe): `adicional_tempo_servico` (tributável) e `salario_familia` (não tributável, não integra FGTS).

**Domínio e telas**
- `src/lib/dp/tempoServico.ts`: `resolverRegraTempoServico(regras, {cargo, unidade, sindicato}, data)`, `ciclosCompletos(admissao, ciclo_meses, max)`, `valorAdicional(base, percentual, ciclos, acumula)`; testes com admissão em 29/02, ciclo em curso, limite de ciclos e regra por escopo.
- `src/lib/dp/salarioFamilia.ts`: `dependentesElegiveis(dependentes, data, config)`, `valorSalarioFamilia(...)`, `pendenciasDependente(dep, hoje)` (vacinação anual, frequência semestral, 14 anos, laudo vencido); testes cobrindo aniversário de 14 anos no mês, deficiência sem limite de idade e remuneração acima do teto.
- `src/lib/dp/encargos.ts` e `src/lib/dp/folha.ts`: incluir o adicional na base de INSS/FGTS/IRRF e excluir o salário-família dessas bases; `holerite.ts` e `folha-relatorios.ts` ganham as duas rubricas.
- `src/components/dp/RemuneracaoFields.tsx`: bloco "Tempo de serviço" (somente leitura + travar valor manual) e resumo do salário-família calculado.
- Nova aba em `ColaboradorFormDialog.tsx` para dependentes, com `src/components/dp/DependentesPanel.tsx` e hook `src/hooks/useDpDependentes.tsx`; nova tela de regras em `src/pages/dp/DpAdicionaisTempoServico.tsx` registrada em `src/config/dpNavigation.tsx` (grupo de Cadastros) e nas rotas.
- Alertas: estender `src/hooks/useDpPendencias.tsx` com as pendências de dependentes e o aviso de novo ciclo de tempo de serviço, reaproveitando o sino/notificações atuais.
- Módulo comercial: as duas features entram como parte do módulo Folha (dependência do DP base), respeitando `can_use_module`.
- Valores legais (cota e teto do salário-família) não ficam no código: entram por configuração, e a tela mostra a vigência cadastrada para o RH confirmar a tabela do ano.
