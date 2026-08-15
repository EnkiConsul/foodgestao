# Vale-alimentação por dia: calcular os dias pela jornada

Você está certo. Hoje, quando o vale-alimentação é "por dia", o cadastro pede "Dias considerados no mês" e o cálculo usa esse número fixo (padrão 22) — ele não consulta a jornada do colaborador. Como a jornada já diz quais dias da semana ele trabalha, esse campo é redundante na maioria dos casos.

## O que muda

1. O campo deixa de ser um número solto e passa a ter duas opções:
   - **Pela jornada do colaborador (padrão)** — o sistema conta os dias trabalháveis do mês a partir dos dias da semana marcados no Horário de Trabalho do colaborador (descontando as folgas fixas). O campo mostra o número calculado em modo leitura, com o texto de origem ("22 dias — seg a sáb, folga domingo").
   - **Quantidade fixa** — só para quem tem acordo/CCT com número fechado de dias (ex.: 22 dias sempre). Aí o número volta a ser editável.
2. Quando a jornada ainda não foi preenchida, o sistema avisa na própria linha ("cadastre o Horário de Trabalho para calcular os dias") e usa 22 como referência provisória, sem travar o salvamento.
3. A prévia do valor mensal do VA passa a mostrar a conta explícita: `valor por dia × dias do mês (origem)`.
4. Na geração/apuração da folha, quando existir ponto apurado no período, os dias considerados são os **dias efetivamente trabalhados** do período, não a média da jornada — o cadastro passa a ser só a regra de referência.

## Detalhes técnicos

- `dp_colaboradores`: novo campo `vale_alimentacao_dias_origem` (`jornada` | `fixo`), default `jornada`. `vale_alimentacao_dias_base` continua existindo e é usado quando a origem é `fixo` (e como fallback).
- Nova regra pura em `src/lib/dp/beneficios-regras.ts`: `diasTrabalhaveisNoMes(diasSemana, competencia)` — conta as ocorrências no mês de cada `dow` marcado como trabalha; testes unitários em `src/test/unit/dpHorarioBeneficios.test.ts` (mês de 30/31 dias, semana 6x1, 5x2, jornada vazia).
- `RemuneracaoFields.tsx`: seletor de origem, número em leitura quando `jornada`, prévia com a conta detalhada; recebe os dias da jornada por prop.
- `ColaboradorFormDialog.tsx`: passa os dias da configuração de trabalho (`useDpColaboradorConfigTrabalho`) para `RemuneracaoFields` e persiste a nova origem.
- `valeAlimentacaoDoMes` (`src/lib/dp/remuneracao.ts`) ganha parâmetro opcional `diasTrabalhados`, com precedência: dias apurados no ponto > dias da jornada > `dias_base` fixo > 22.
