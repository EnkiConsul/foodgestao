# L02 — restringir consultas internas de admissão e remuneração

## Problema confirmado
Em homologação, usuário da empresa 1 conseguiu ler valor previsto de remuneração de colaborador sintético da empresa 2 (37 × 8 = 296), por dp_convocacao_remuneracao_snapshot. As regras de admissão sintéticas da empresa 2 também ficaram acessíveis a esse usuário e a anon pela versão de cinco argumentos de dp_admissao_regras_resolver.

## Correção
Migration 20260918104932_restrict_dp_internal_reads.sql revoga EXECUTE de PUBLIC, anon e authenticated nas duas assinaturas do resolvedor de admissão e no snapshot de remuneração. service_role e o proprietário conservam acesso. Os corpos e os cálculos permanecem iguais. Trata-se de restrição intencional da API direta, inclusive para administradores autenticados: essas rotinas são auxiliares do servidor.

Busca em src e supabase/functions não encontrou chamada direta dessas RPCs pelo navegador. dp-preadmissao-publica e dp-preadmissao-gestor usam serviceClient, definido em _shared/authz.ts com a chave de serviço, para o resolvedor de cinco argumentos. Os chamadores SQL do snapshot são dp_convocacao_avaliar_candidato, dp_convocacao_decidir_parcial e dp_convocacao_horario_efetivo, todos SECURITY DEFINER.

A alternativa de mudar o resolvedor para SECURITY INVOKER foi descartada nesta etapa: as políticas das tabelas auxiliares não são uniformes e poderiam ocultar filtros de sexo do colaborador, alterando a resolução das regras.

## Validação
Aplicada apenas em utjhzpdbqzajrhnzcher. Testes SQL com fixtures sintéticas, SET LOCAL ROLE e ROLLBACK:
- baseline reproduziu remuneração alheia e regras alheias; anon também leu regras;
- após migration, chamadas diretas de authenticated e anon falharam por insufficient_privilege;
- catálogo verificou negação de EXECUTE para ambos os papéis nas três assinaturas;
- service_role manteve regra obrigatória e cálculo 296; proprietário manteve cálculo;
- assinatura antiga de quatro argumentos teve ACL verificada; sua resolução funcional não foi executada.

Regressão manual versionada: scripts/qa/l02-internal-reads.sql, com confirmação explícita do destino sintético. Resultados e baseline: homologacao/l02-internal-*. Os dados de teste foram revertidos.

Advisor: avisos de funções privilegiadas acessíveis a anon passaram de 6 para 4 e a authenticated de 232 para 229. Alertas restantes exigem revisão individual: [orientação Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

## Limites
AUD-011 permanece parcial. Não houve teste HTTP/navegador nem execução completa de admissão/convocação nesta etapa. Chamadores privilegiados ainda precisam de auditoria própria; esta mudança fecha apenas a chamada direta aos auxiliares. Integrações externas não representadas no repositório podem precisar usar os fluxos autorizados do servidor. Produção não foi modificada.
