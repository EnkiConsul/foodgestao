# Marcação de férias atrasada quando o prazo já não cabe os dias a gozar

## Regra

Se os dias que faltam até o prazo legal forem **menores ou iguais** aos dias de férias que a pessoa ainda tem para gozar, a marcação já está atrasada: não há mais como conceder o descanso inteiro dentro do prazo.

Exemplo: faltam 25 dias para o prazo e a pessoa tem 30 dias a gozar → atrasado, mesmo antes de o prazo vencer.

## O que muda nas telas

- Novo selo **"Marcação atrasada"** (vermelho, mesmo peso de "Vencido") nos períodos nessa situação, em Férias, no painel de férias e nas pendências.
- Texto da pendência: "Férias — marcação atrasada", com explicação do tipo "faltam 25 dia(s) para o prazo legal e ainda há 30 dia(s) a gozar".
- Essas pendências entram como atrasadas na contagem de urgência do Início (e por isso aparecem no chip "Atrasado"), acima das que só estão em risco.
- Prioridade dos sinais: prazo vencido > marcação atrasada > risco de dobra (90 dias) > acompanhar (180 dias) > a conceder > a vencer.
- Sócios e períodos com controle externo continuam fora de qualquer cobrança de prazo.

## Detalhes técnicos

- `src/lib/dp/ferias-direito.ts`: novo nível `marcacao_atrasada` em `NivelVencimento` + `NIVEL_VENCIMENTO_META`; em `nivelVencimentoPeriodo`, após o teste de vencido, retornar o novo nível quando `diasRestantes <= diasSaldo` e `diasSaldo > 0`; `alertaPendenciaFerias` ganha o título/detalhe correspondente.
- `src/hooks/useDpPendencias.tsx` (bloco de férias, ~linha 832): tratar o novo nível como atraso, gerando `atrasoDias` positivo (dias já perdidos = `diasSaldo - diasRestantes`) para que a ordenação e os chips de urgência o classifiquem como atrasado.
- `src/pages/dp/DpFerias.tsx` e `src/components/dp/ferias/FeriasDashboard.tsx`: usam o meta do nível, então só precisam contemplar o novo valor nos filtros/contadores existentes.
- Testes em `src/lib/dp/__tests__/`: prazo maior que o saldo (sem alerta novo), prazo igual ao saldo, prazo menor que o saldo, saldo zero e sócio.
