# Remuneração e benefícios no cadastro do colaborador

Sim — hoje a folha nasce incompleta. Confirmei no projeto:

- `dp_colaboradores` não tem nenhum campo de remuneração. Não existe salário, tipo de pagamento, valor-hora, dependentes de IRRF nem adicional de insalubridade/periculosidade.
- A geração da folha (`dp_folha_gerar_lancamentos`) usa **apenas** `dp_cargos.salario_base`. Se o cargo estiver sem salário (ou o colaborador sem cargo), o lançamento é criado com valor zero, sem aviso.
- Os dependentes usados no cálculo de IRRF (`src/lib/dp/encargos.ts`) só existem dentro do detalhe do lançamento da folha — ninguém preenche isso no cadastro, então o IRRF sai sempre sem dedução.
- Benefícios existem (`dp_beneficios` + `dp_colaborador_beneficios`), mas só podem ser vinculados na tela de Benefícios, fora do cadastro do colaborador.
- Assiduidade (faltas, atrasos, extras, DSR) já vem do ponto/apuração — isso não precisa ser cadastrado, apenas depende do valor-hora, que hoje é derivado de um salário que pode não existir.

## O que será feito

### 1. Nova etapa "Remuneração e benefícios" no cadastro do colaborador

Adicionada ao `ColaboradorFormDialog`, com os campos:

- **Forma de pagamento**: mensalista, horista ou diarista. Para Intermitente o padrão é horista (coerente com a política de contratos já existente).
- **Salário base** (mensalista/diarista) ou **valor da hora** (horista). Pré-preenchido com o salário do cargo escolhido, podendo ser sobrescrito por colaborador.
- **Dependentes para IRRF** (número).
- **Adicional de insalubridade / periculosidade** (percentual), sugerido quando o cargo estiver marcado como insalubre/periculoso.
- **Vale-transporte**: opta ou não, com valor diário e desconto legal de até 6%.
- **Benefícios**: seleção dos benefícios ativos da empresa com valor e desconto, gravando direto em `dp_colaborador_beneficios`.

Adiantamento continua respeitando a regra atual (oculto para Intermitente/PJ/MEI).

### 2. Validação e pendências

- Salvar o colaborador sem remuneração é permitido apenas como rascunho; o cadastro passa a exibir alerta de dado obrigatório para folha.
- Ao gerar a folha, colaboradores sem salário/valor-hora definidos são listados como bloqueio, em vez de gerar lançamento com valor zero.
- Novo item nas pendências do DP: "Colaboradores sem remuneração definida".

### 3. Folha passa a usar os dados do cadastro

- A geração de lançamentos usa a remuneração do colaborador e, na ausência dela, o salário do cargo.
- Horista/diarista têm o bruto calculado pelas horas apuradas no ponto do período, não por valor fixo.
- Dependentes e adicionais do cadastro alimentam o cálculo de INSS/IRRF e aparecem no holerite.
- Benefícios do colaborador entram automaticamente como proventos/descontos do período.

## Detalhes técnicos

- Migração em `dp_colaboradores`: `forma_pagamento` (enum), `salario_base numeric`, `valor_hora numeric`, `dependentes_irrf smallint`, `adicional_percentual numeric`, `vale_transporte boolean`, `vale_transporte_valor_dia numeric` — todos com defaults seguros para os registros existentes.
- Atualização de `dp_folha_gerar_lancamentos` para `COALESCE(colaborador, cargo)`, cálculo por horas para horista/diarista e gravação de `dependentes` no `detalhe` do lançamento.
- Reaproveitamento de `valorHoraDe` (`src/lib/dp/apuracao.ts`), `calcularEncargos` (`src/lib/dp/encargos.ts`) e `dp_beneficios_gerar_lancamentos`.
- `permiteAdiantamento` em `src/lib/dp/contrato-policy.ts` ganha a regra de forma de pagamento.
- Testes unitários para o cálculo de bruto por forma de pagamento e para o desconto legal de vale-transporte.
