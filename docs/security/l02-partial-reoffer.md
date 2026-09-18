# Reoferta parcial e solicitações simultâneas

## Falha e correção
dp_convocacao_decidir_parcial(REOFERTAR) grava origem_oferta=reoferta_parcial, mas dp_convocacoes_origem_oferta_check aceitava somente convocacao/substituicao. Baseline SQL reproduziu a violação.
Migration 20260918133351_allow_partial_reoffer_origin.sql inclui reoferta_parcial, preservando os valores existentes e a recusa de outros valores. Nenhuma função ou permissão foi alterada.

## Testes em homologação
Projeto utjhzpdbqzajrhnzcher:
- regressão transacional criou uma reoferta para candidato sintético a 41/h, 8 horas, total 328;
- repetir REOFERTAR retornou NO_ELIGIBLE, sem duplicar;
- primeira tentativa de concorrência pelo MCP usou PIDs diferentes, mas timestamps mostraram execução sequencial; não foi contada como teste concorrente;
- quatro requisições HTTP autenticadas foram iniciadas entre 13:36:47.286 e 13:36:47.300 UTC e concluídas entre .649 e .669, em 2026-09-18;
- uma retornou ok=true/ofertas_criadas=1; três retornaram NO_ELIGIBLE; todas HTTP 200;
- consulta posterior confirmou uma reoferta pendente e valor 328;
- fixtures compartilhadas foram preparadas com COMMIT após ensaio de criação/limpeza. Foram removidas após o teste; verificação confirmou zero unidades/colaboradores sintéticos. Nenhum vínculo de usuário existente foi alterado no cenário HTTP.

SQL manual versionado: scripts/qa/l02-partial-reoffer.sql.
Evidências locais: homologacao/l02-reoffer-* (baseline, pós-condições, resultados MCP/HTTP, setup/limpeza e advisor). Script HTTP mantém credenciais fora dos arquivos e valida o projeto/URL/identidade antes da chamada.

## Limites
Aplicado somente na homologação. Chamadas HTTP tiveram sobreposição temporal; não houve instrumentação de locks no PostgreSQL. Esse cenário não comprova todos os casos de concorrência, especialmente disputa entre APROVAR/REOFERTAR/aceite de outro candidato, nem múltiplas vagas. Navegador e cenários noturnos continuam pendentes.
Advisor mantém alertas existentes, sem aumento: [referência](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Produção permanece inalterada.
