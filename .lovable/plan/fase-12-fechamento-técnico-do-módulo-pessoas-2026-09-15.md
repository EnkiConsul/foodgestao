# Fase 12 — Fechamento técnico do módulo Pessoas

Diagnóstico primeiro. Nenhuma correção antes de você ver o inventário completo.

## O que já foi verificado agora (leitura apenas)

- O verificador de segurança da plataforma retorna hoje **3 avisos** (nenhum crítico): um já dispensado por você, um sobre documentos disciplinares e um sobre uma cláusula desnecessária em duas rotinas de identificação do colaborador. Os "63 apontamentos" vêm do verificador próprio do projeto (`scripts/security-lint.mjs`, 16 regras), que precisa da chave de banco do CI para rodar — vou reproduzir as 16 regras por consulta direta ao banco para reconstruir a lista item a item.
- O arquivo de ambiente está versionado, e contém **somente** as quatro chaves públicas do app (projeto, endereço, chave publicável e uma chave de logotipo). Nenhum segredo real. Ele é necessário para o build.
- Existem 5 automações de verificação e 66 funções de servidor, das quais 14 pertencem ao módulo Pessoas.

## Etapa 1 — Diagnóstico (entrego relatório, sem mudar nada)

1. **Segurança:** reconstruir os 63 apontamentos consultando o banco (permissões de execução, rotinas privilegiadas, caminho de busca, políticas, tabelas sem regra, exposição a visitante). Cada item classificado: objeto, motivo, real ou necessidade arquitetural, impacto, módulo, prioridade P0/P1/P2 e correção proposta.
2. **Permissões:** inventário de quem pode executar cada rotina (visitante, autenticado, interno) e marcação das que devem perder acesso.
3. **Isolamento entre empresas:** matriz de leitura/criação/edição/exclusão/execução para admin, gestor, colaborador, bloqueado e visitante — validada em banco temporário descartável, nunca no banco real.
4. **Funções de servidor do Pessoas:** as 14 funções auditadas por método, autenticação, autorização, validação de dados, empresa, erros, registros, segredos e uso de credencial interna; marcar as sem uso.
5. **Repositório:** confirmar se a branch principal segue desprotegida e propor proteção compatível com a sincronização Lovable (sem bloquear o envio automático).
6. **Automações:** confirmar quais verificações realmente aparecem no GitHub e podem ser exigidas; apontar as que faltam (checagem das funções de servidor, migrações, isolamento).
7. **Ambiente e segredos:** confirmar ausência de segredo em código, arquivos versionados, migrações, registros, testes e documentação.
8. **Código legado:** rotinas, funções e políticas sem uso — verificando dependências no banco antes de propor remoção.

## Etapa 2 — Correções (somente após sua aprovação item a item)

Aplico apenas o que for confirmado como problema real. Rotinas privilegiadas podem permanecer quando validam autenticação e autorização, não confiam na empresa vinda da tela, têm caminho de busca fixo e permissão mínima — nesses casos entrego a justificativa, não a alteração.

## Etapa 3 — Testes finais e parecer

Suíte completa, isolamento entre empresas, visitante, colaborador, gestor, admin, bloqueado, desligado dentro e após 30 dias, build, lint, tipos, migrações e checagem das funções de servidor. Depois: quadro ANTES 63 / CORRIGIDOS / MANTIDOS COM JUSTIFICATIVA / RESTANTES REAIS, plano de reversão e parecer final do módulo Pessoas.

## Pendências de homologação (permanecem registradas, fora do escopo técnico)

- Teste real com PDF do escritório contábil (Fase 6).
- Teste real de liberação de acesso do colaborador (Fase 7).
- Teste real da mensagem de regra de acesso (Fase 9).

## Detalhes técnicos

- Reprodução do lint por `supabase--read_query` sobre `pg_proc`/`aclexplode`, `pg_policy`, `pg_class`, `information_schema.role_table_grants` e `pg_publication_tables`, espelhando os 16 checks de `scripts/security-lint.mjs`.
- Validação de RLS/multiempresa via `scripts/test-p04-isolated.mjs` (cluster Postgres descartável, estrutura real, fixtures sintéticas, duas empresas).
- Correções de permissão como migração idempotente (`REVOKE`/`GRANT`, `ALTER FUNCTION ... SET search_path`), com rollback declarado; nenhum DDL na origem sem aprovação.
- Proteção de branch proposta: PR obrigatório com 0 revisões exigidas + status checks (`quality`, `security-lint`), mantendo push do app Lovable via allowlist de ator, para não quebrar a sincronização.
- Nada é publicado nesta fase.
