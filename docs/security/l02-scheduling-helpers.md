# L02 — conflitos de férias e auxiliares de convocação

## Falha reproduzida
Um usuário sintético da empresa 1 consultou folga da empresa 2 por dp_ferias_periodo_conflitos. Apesar da restrição anterior do snapshot, dp_convocacao_avaliar_candidato e dp_convocacao_horario_efetivo ainda permitiam obter a remuneração alheia indiretamente (37 × 8 = 296). A segunda aceita um JSON de avaliação fornecido pelo chamador. Esse teste confirma a necessidade de revisar os chamadores privilegiados, além do auxiliar original.

## Correção
Migration 20260918110746_restrict_dp_scheduling_helpers.sql revoga EXECUTE de PUBLIC, anon e authenticated nas três funções; conserva serviço/proprietário e todos os corpos existentes.
Não foram encontradas chamadas diretas em src ou supabase/functions (somente tipos gerados). No catálogo, os chamadores dos auxiliares de convocação são SECURITY DEFINER, pertencem a postgres e usam controles de administrador/empresa ou identidade do colaborador:
- dp_convocacao_pre_avaliar_grupo;
- dp_convocacao_publicar_grupo;
- dp_convocacao_avaliar_parcial;
- duas assinaturas de dp_convocacao_responder_oferta.

Não foi encontrado chamador SQL atual de dp_ferias_periodo_conflitos. A função permanece disponível ao servidor.

## Testes executados
Apenas homologação utjhzpdbqzajrhnzcher, com dados sintéticos e ROLLBACK:
- baseline confirmou as três leituras indevidas, enquanto pre_avaliar_grupo negou a empresa estrangeira;
- após migration, as três chamadas diretas falharam com insufficient_privilege para authenticated e anon;
- gestor autenticado da empresa correta executou pre_avaliar_grupo com candidato apto e horário 09:00–17:00, atravessando os dois auxiliares e o snapshot previamente restrito;
- gestor bloqueado e usuário de outra empresa foram recusados no mesmo ponto de entrada;
- serviço manteve conflito de folga e cálculo 296 pelos dois auxiliares;
- catálogo confirmou as permissões finais; nenhum colaborador da fixture permaneceu.

Regressão manual: scripts/qa/l02-scheduling-helpers.sql. Evidências locais: homologacao/l02-scheduling-*.

## Limites e continuidade
Não houve publicação/aceite de ofertas nem testes HTTP/navegador nesta etapa. A inspeção dos controles nos demais chamadores não substitui testes de cada fluxo. AUD-011 permanece parcial até revisão dos demais caminhos e validação integrada. Produção inalterada.
O advisor continua listando funções privilegiadas que precisam de revisão contextual: [orientação Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
