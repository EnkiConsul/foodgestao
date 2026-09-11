# Folha de ponto não deve ser cobrada em mês 100% de licença

## O que está acontecendo (confirmado)

A regra de "mês inteiro afastado" foi implementada só no cálculo feito na tela. Mas as pendências de contracheque, adiantamento, folha de ponto e rescisão vêm de uma apuração salva no servidor, que substitui o cálculo da tela para esses tipos. Essa apuração do servidor não conhece a licença.

Consulta na apuração salva mostra exatamente uma linha para a Rosângela: folha de ponto de 2026-05 — o mesmo item da tela. A licença dela vai de 01/02/2026 a 01/06/2026, ou seja, maio está 100% coberto.

## O que será feito

1. A apuração do servidor passa a considerar afastamentos aprovados (licença-maternidade, licença-paternidade e atestado com período): quando o afastamento cobre todos os dias do mês em que a pessoa poderia trabalhar (respeitando admissão e desligamento), a folha de ponto daquele mês deixa de ser cobrada dela.
2. Vale só para a folha de ponto. Contracheque, adiantamento e rescisão continuam como hoje, porque o pagamento acontece durante a licença.
3. Ao cadastrar, alterar ou cancelar um afastamento, a apuração é marcada para ser refeita, de forma que a pendência desapareça sem esperar a atualização diária.
4. Depois do ajuste, a apuração da Pakerê é refeita e eu confirmo que a folha de ponto de fevereiro a maio da Rosângela não aparece mais, e que junho (mês parcial) continua sendo cobrado.

## Detalhes técnicos

- `private.dp_refresh_document_pending`: no CTE `candidatos`, novo campo `afastado_mes_inteiro` via `EXISTS` em `dp_solicitacoes` (status `aprovada`, tipos `atestado`/`licenca_maternidade`/`licenca_paternidade`) comparando `data_alvo`/`COALESCE(data_fim, data_alvo)` com a interseção de `inicio_mes`/`fim_mes` e `admissao`/`desligamento` — a mesma regra de `afastamentoCobreCompetencia` em `src/lib/dp/licencas.ts`. No filtro de `elegiveis`, o ramo `d.doc_tipo = 'ponto'` recebe `AND NOT c.afastado_mes_inteiro`.
- Trigger `AFTER INSERT/UPDATE/DELETE` em `dp_solicitacoes` chamando a função de "sujar" a apuração já usada pelas outras tabelas (`dp_pendencias_apuracoes.sujo_desde`).
- Teste SQL em `supabase/tests/` cobrindo mês integral versus mês parcial.
