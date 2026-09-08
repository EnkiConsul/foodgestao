# Férias: regra padrão passa a cobrar o ciclo do ano anterior

## O que muda para você

Hoje, quando a empresa não define uma data de corte, o sistema só cobra o último ciclo de férias já completo e o ciclo em curso. Por isso quase ninguém aparece como "férias vencidas".

A nova regra padrão passa a cobrar:

- o ciclo aquisitivo que se encerrou no ano anterior ao atual (hoje: encerrado em 2025);
- o ciclo que se encerrou neste ano;
- o ciclo em curso.

Assim, todo mundo com pelo menos um ano de casa tem no mínimo um período de férias sinalizado — e quando o prazo de concessão já passou, ele aparece como vencido nos indicadores e nas atenções da tela de Férias.

Nada anterior a isso continua sendo cobrado: segue marcado como "Controle externo" (histórico, sem alerta).

Se a empresa (ou a ficha da pessoa) tiver uma data de corte informada, ela continua valendo e prevalece sobre o padrão.

## Reprocessamento dos cadastros atuais

Junto com a mudança, todos os colaboradores ativos são reavaliados uma única vez:

- os períodos que passam a entrar na nova regra deixam de ser "Controle externo" e voltam a ser cobrados;
- períodos que faltavam dentro da janela são criados;
- saldos e prazos são recalculados;
- nada é apagado e nenhuma férias já registrada é alterada.

## Detalhes técnicos

- `public.dp_ferias_corte_efetivo(uuid)`: mantém a precedência colaborador → empresa → padrão. O padrão deixa de ser "início do último período aquisitivo completo" e passa a ser o início do período aquisitivo cujo `fim_aquisitivo` cai no ano civil anterior (`extract(year from fim) = extract(year from current_date) - 1`); quando não existir esse ciclo (admissão recente), retorna a data de admissão. Nunca antes da admissão.
- `src/lib/dp/ferias-direito.ts` → `corteFeriasPadrao`: mesma regra em TypeScript (recuar até o aniversário cujo fim de ciclo está no ano anterior), mantendo o piso na admissão.
- `src/lib/dp/__tests__/ferias-corte.test.ts`: atualizar os três casos e acrescentar casos de admissão no ano corrente e no ano anterior.
- Migração com bloco único de reprocessamento: para cada colaborador com `data_admissao` e sem `data_desligamento`, recalcular o corte, inserir períodos faltantes (`ON CONFLICT DO NOTHING`), ajustar `controle_externo = (fim_aquisitivo < corte)` e chamar `dp_ferias_recalc_periodo` nos períodos afetados. Sem `DELETE`/`DROP`.
- `dp_ferias_gerar_periodos` não muda de assinatura nem de validações (`private.is_company_admin_or_owner`, `SECURITY DEFINER`, `search_path`, grants preservados).
- Consumidores (`useDpFerias`, `useDpFeriasConfig`, `useAnalyticsFerias`, `useDpPendencias`, `FeriasDashboard`) continuam filtrando `controle_externo = false` — passam a enxergar os períodos reabertos sem alteração de código.

## Verificação

- Testes unitários do corte + suíte de testes do Pessoas 360 e typecheck.
- Consulta de conferência: nenhum colaborador ativo com mais de um ano de casa fica sem período cobrado; indicador de "vencidos" na tela de Férias passa a refletir os prazos reais.
