# Pessoas 360 — Fase 8: Menor privilégio no banco (visitante sem poder de escrita)

## Situação conferida agora

Consultei os privilégios reais do banco (não as políticas, e sim a permissão de base):

- O papel de **visitante** (quem não está logado) ainda tem permissão de **inserir, alterar e apagar** em **~144 tabelas** do sistema, inclusive cadastro de colaboradores, cargos, benefícios, avisos, empresas, categorias e o próprio registro de auditoria.
- Hoje o que segura o visitante são as regras de linha (que exigem usuário logado). Ou seja: a proteção existe, mas depende de **uma única camada**. Qualquer regra nova escrita sem cuidado abre gravação para quem não está logado.
- **36 rotinas internas** do servidor (incluindo funções que só servem como gatilho e rotinas do esquema reservado `private`) também podem ser chamadas por visitante. Elas hoje recusam por falta de sessão, mas não deveriam nem estar ao alcance.
- As fases 1 a 7 já fecharam a gravação direta das tabelas de documentos, férias, escala, solicitações e ficha do colaborador para usuários logados. Nenhuma tabela de Pessoas aceita mais gravação direta do aplicativo.

## O que a Fase 8 faz

1. **Retirar do visitante toda permissão de gravação** nas tabelas do sistema, mantendo apenas a leitura onde ela é realmente pública (conteúdo do site, planos, catálogo de módulos, cadastro de bancos e o recebimento de contatos do site, que continua funcionando).
2. **Retirar do visitante a permissão de executar rotinas internas**: funções de gatilho, tudo do esquema reservado e as rotinas de Pessoas que só fazem sentido com sessão ativa.
3. **Preservar intacto** o que hoje funciona sem login: entrar, recuperar senha, aceitar convite, primeiro acesso, formulário de contato do site e as páginas públicas. Cada um desses caminhos será conferido antes e depois.
4. **Prova de que nada quebrou**: rodar os testes automatizados de acesso (que simulam visitante) e reexecutar as provas em transação desfeita das fases anteriores, além de abrir as telas públicas no navegador.

## Fora do escopo

- Nenhuma mudança de tela, layout ou texto.
- Nenhuma mudança no módulo financeiro além da retirada de permissão do visitante (o comportamento do usuário logado continua igual).
- Nada de apagar dados, reprocessar webhooks ou reconectar bancos.

## Detalhes técnicos

- Uma migration única e reversível, com `REVOKE INSERT, UPDATE, DELETE ON <tabela> FROM anon` gerado a partir do inventário de ACLs (`pg_class.relacl`), e `GRANT SELECT TO anon` mantido só na allowlist pública: `landing_content`, `mkt_*` (conteúdo do site), `plans`, `modulos_catalogo`, `module_dependencies`, `banks`, `coupons`. `mkt_leads` mantém apenas `INSERT` para o formulário do site, se a política atual depender disso; caso o envio passe por Edge Function com `service_role`, o `INSERT` do visitante também é retirado.
- `REVOKE EXECUTE ... FROM anon, PUBLIC` nas 36 rotinas `SECURITY DEFINER` listadas: 12 em `private` (`dp_acesso_situacao`, `dp_pode_agir`, `dp_pode_ver_documentos`, `dp_portal_acesso_revogar_core`, `dp_portal_decisao`, `dp_refresh_document_pending_queue`, `is_company_owner`, `is_dp_colaborador_of_company`, `pluggy_can_edit`, `pluggy_can_manage_accounts`, `pluggy_module_edit`, `prevent_association_tenant_change`) e as de `public`, separando (a) funções de gatilho, que perdem `EXECUTE` de todos os papéis de cliente, e (b) rotinas chamadas pelo aplicativo, que ficam apenas com `authenticated` + `service_role`.
- `ALTER DEFAULT PRIVILEGES` revisado para que novas tabelas em `public` não nasçam com escrita para `anon`.
- Tabelas de auditoria (`audit_logs*` e partições) e filas de webhook ficam sem gravação de cliente algum — só `service_role`.
- Rollback documentado na própria migration (bloco comentado com os `GRANT` equivalentes por tabela).
- Verificação: `supabase--linter` antes e depois (baseline atual 309 avisos), `bunx vitest run` (2.338 + 20 testes de acesso), `bunx tsgo --noEmit -p tsconfig.app.json`, provas em transação desfeita com sessão simulada de visitante e de administrador, e um roteiro no navegador cobrindo entrada, recuperação de senha, convite e formulário do site.
- Relatório obrigatório no formato das fases anteriores, com parada para sua conferência ao final.

## Pendência que continua aberta

Publicar o site com as fases 1 a 7 segue aguardando sua decisão.
