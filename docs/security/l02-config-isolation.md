# L02 — configurações de DP: isolamento por empresa
Data: 2026-09-18. Escopo parcial de AUD-011.

## Correção
dp_config_resolvida e dp_ferias_config passaram de SECURITY DEFINER para SECURITY INVOKER. As chamadas diretas agora respeitam as políticas existentes de dp_config_dp. EXECUTE público/anônimo foi revogado; authenticated e service_role preservados. Assinaturas, corpos e dados não foram alterados.

## Evidência
Antes: usuário da empresa 1 lia configuração 43 da empresa 2 por ambas as RPCs.
Depois da migration em utjhzpdbqzajrhnzcher: configuração própria 31 preservada; configuração alheia oculta; usuário bloqueado ou com vínculo removido sem acesso; colaborador ativo sem vínculo de membro acessa somente sua empresa; contexto privilegiado do banco e service_role preservados; anon sem EXECUTE.
Os testes foram executados com SET LOCAL ROLE e claims sintéticas, em transação revertida. Não foram testes HTTP/navegador nem fluxos completos de férias/trocas.
Sem acesso, dp_config_resolvida retorna composto nulo e dp_ferias_config mantém os valores padrão públicos (60/legal/3/5/14), sem revelar a configuração armazenada.

## Limites e próximos itens
Aplicado somente na homologação. AUD-011 permanece aberto para outras funções privilegiadas. AUD-064 (colaborador excluído logicamente) permanece aberto. Revisar funções de admissão, remuneração e conflitos, testar jornadas completas e executar CI antes de promover.
Advisor: 232 funções SECURITY DEFINER executáveis por autenticados (antes 234); 6 por anon; 2 extensões em public; 1 proteção de senha vazada desativada; 1 tabela auxiliar RLS sem política. Esses avisos exigem análise contextual, não equivalem individualmente a vulnerabilidades confirmadas.
Referência do advisor: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Arquivos
- Migration: supabase/migrations/20260918020000_dp_config_invoker.sql
- Evidências locais: l02-config-before-after.sql, l02-config-before-after-result.json, l02-config-post-migration.sql, l02-config-post-results.json.
