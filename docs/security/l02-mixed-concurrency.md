# Disputa entre aprovação parcial e aceite da reoferta

## Resultado
Não foi necessária nova alteração de regra nesta etapa. Após as migrations anteriores, a homologação preservou uma única oferta aceita nos cenários executados.

## Evidências
Projeto utjhzpdbqzajrhnzcher, dados sintéticos:
- SQL: APROVAR primeiro cancela a reoferta; aceite posterior retorna INVALID_STATE.
- SQL: aceite primeiro supera a proposta parcial; APROVAR posterior retorna INVALID_STATE.
- Em ambas as ordens, exatamente uma oferta aceita. Testes revertidos.
- HTTP com sessões diferentes de gestor e trabalhador: chamadas iniciadas às 14:27:13.915 e .923 UTC de 2026-09-18, concluídas às 14:27:14.061 e .063.
- APROVAR retornou ok=true; aceite retornou INVALID_STATE/cancelada.
- Pós-condições confirmaram oferta original aceita, parcial aprovada, 10–14, 4 horas e 148; reoferta cancelada.
- Fixtures HTTP foram removidas; consulta final confirmou zero unidades/colaboradores de teste. A associação temporária do trabalhador existiu somente no colaborador sintético removido, sem alterar seus vínculos de empresa.

A primeira tentativa HTTP teve 401/PGRST303 “JWT issued at future” na sessão do gestor; ela não foi contada como teste concorrente válido. Após recriar os dados e aguardar dois segundos após o login, ambas as chamadas chegaram às regras de negócio. Não se alterou validação de JWT nem configuração de autenticação. Esse evento isolado não comprova defeito de autenticação na aplicação.

## Regressões e limites
Scripts manuais: scripts/qa/l02-mixed-approve-first.sql e l02-mixed-accept-first.sql.
Evidências locais: homologacao/l02-mixed-http-results.json, l02-mixed-http-first-attempt.json, l02-mixed-evidence.json, l02-mixed-cleanup.sql.
Sobreposição HTTP foi observada; não houve instrumentação de locks. Uma rodada concorrente não comprova ausência de todas as corridas/deadlocks. Múltiplas vagas, múltiplas propostas independentes, trabalho noturno e interface do navegador permanecem pendentes.
Nenhuma mudança em produção, nenhuma migration nova nesta etapa.
