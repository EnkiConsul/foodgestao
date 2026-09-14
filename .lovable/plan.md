# Fase 0 — Baseline técnico do Pessoas 360° (auditoria, sem alterações)

Nenhum arquivo do sistema foi alterado. Abaixo o estado confirmado por leitura do repositório e consulta ao banco.

## 1. Commit analisado
`82a6fdbf850c7e166edb4342c2229897a4c0c7d4` — branch `main` (HEAD = origin/main), último commit "Removeu telas e dados SESMT".

Volume atual: `src/pages/dp` 38 itens, `src/pages/dp/portal` 13, `src/components/dp` 115, `src/hooks` 132, `src/hooks/portal` 3, `src/lib/dp` 104, `src/config` 4, `supabase/functions` 66, `supabase/migrations` 648.

## 2. Acesso do colaborador — funções existentes
`dp-criar-acesso-colaborador`, `dp-invite-colaborador`, `dp-reset-password`, `dp-alterar-senha-colaborador`, mais o trilho novo `auth-login`, `auth-recovery-request`, `auth-recovery-verify`, `auth-recovery-reset`, `auth-config`, `auth-email-hook`.

Caminho do gestor hoje: painel de acesso do colaborador → função de criação → usuário Auth com e-mail sintético de CPF → vínculo em `dp_colaboradores.user_id`/`email_portal` → papel `dp_colaborador` em `user_roles` → senha provisória com `must_change_password` em `auth_user_security_state` → colaborador troca em `/primeiro-acesso`.

Duplicidades/legados confirmados:
- dois caminhos de criação de acesso (senha provisória x convite por e-mail) com regras diferentes;
- dois caminhos de troca de senha (reset pelo gestor x alteração direta);
- `dp-invite-colaborador` lista usuários com `listUsers(perPage=200)` — não escala e pode não achar o usuário existente;
- `dp-invite-colaborador` usa lista própria de origens CORS, diferente do compartilhado.

## 3. Identidade do colaborador
`dp_colaborador_of(_user_id)` e `dp_colaborador_ativo_of(_user_id)` existem como SECURITY DEFINER com `search_path=public` e são usadas nas policies (leitura do próprio documento, folga própria, etc.) — nesse uso a identidade vem de `auth.uid()`, correto.

Risco: o parâmetro `_user_id` é aberto; qualquer chamada que passe um id vindo da tela contorna a sessão. Há dezenas de telas/hooks que trafegam `colaborador_id` para gravações diretas (inventário completo na Fase 3).

## 4. Folgas — P0 confirmado
Existem **duas** assinaturas de `dp_folga_solicitar` no banco:
- `(p_data date, p_motivo text)` — legada, `EXECUTE` concedido a **PUBLIC**;
- `(p_data date, p_motivo text, p_fora_da_janela boolean)` — atual, usada pelo portal (`DpMeuCalendario.tsx:720`).

A versão legada continua chamável e não aplica a regra da janela mensal.

## 5. Gravações diretas pelo portal (sem RPC/Edge)
- `DpMeuCalendario.tsx`: `dp_folgas` insert/delete, `dp_trocas` insert;
- `DpMeuTrocas.tsx`: `dp_trocas` insert/update;
- `DpMeuSolicitacoes.tsx` e `DpMeuDocumentos.tsx`: `dp_solicitacoes` insert/update;
- `useDpEscalaMes.tsx`: `dp_escala_itens` delete+insert em duas chamadas (sem transação).

Nesses pontos a regra é calculada na tela antes da gravação; o banco só barra o que a policy cobre.

## 6. RLS — expressões relevantes (amostra verificada)
- `dp_documentos`: `dp_doc_colab_self_read` (`colaborador_id = dp_colaborador_of(auth.uid())`), `dp_doc_colab_submit` (insert só com `dp_colaborador_ativo_of`, `submetido_por_colaborador`, status pendente), `dp_doc_colab_cancel_pending` (delete só do próprio pendente), admin read/write por `private.is_company_admin_or_owner`;
- `dp_folgas`: `dp_folgas_self_insert`/`self_delete` amarradas a `dp_colaborador_ativo_of` + `criado_por = auth.uid()` + origem `solicitacao` + status agendada + data futura; leitura do colaborador limitada à própria empresa;
- `dp_bulk_import_batches`/`items`: só admin/owner/super da empresa.

## 7. Portal x administrativo
- `/dp/meu` → `PortalProtected` → `ColaboradorShell` (sem verificação de assinatura nem de módulo);
- `/dp` → `ProtectedRoute` → `SubscriptionGuard` → `ModuleGuard("dp")` → `DpLayout`.

Consequência: o portal continua acessível quando a assinatura/módulo do cliente não está ativo (tratado na Fase 8).

## 8. Baseline de qualidade
Scripts reais do projeto: `npm run typecheck:strict` (`tsc -p tsconfig.strict.json`), `npm test` (`vitest run`), `npm run build` (`vite build`), `npm run lint` (`eslint .`). Última execução conhecida do conjunto de testes: 1665 aprovados, 50 ignorados. Baseline completo (strict, lint, build, deno check das funções da Fase 1) será executado no início da Fase 1, sem correção de itens preexistentes.

## 9. Riscos
**P0**
1. `dp_folga_solicitar(date,text)` legada com EXECUTE a PUBLIC e sem regra de janela.
2. Senha/recuperação de acesso do colaborador em trilhos duplicados, com regras divergentes de força de senha e de obrigatoriedade de troca.
3. Gravações diretas de folga/troca/solicitação com regra apenas na tela.

**P1**
4. Identidade aceitando id vindo do cliente em funções e telas.
5. Portal sem guarda de assinatura/módulo.
6. Substituição de documento sem versionamento explícito.
7. Importação/OCR sem lease, retry e recuperação de lote preso em processamento.
8. `listUsers(perPage=200)` e CORS divergente em `dp-invite-colaborador`.

## 10. Fase 1 — escopo proposto (aguardando aprovação)
Objetivo: um único trilho de acesso e senha do colaborador, fechado por padrão.

Alterações previstas:
- `supabase/functions/dp-criar-acesso-colaborador`, `dp-reset-password`, `dp-alterar-senha-colaborador`, `dp-invite-colaborador`: método HTTP, autenticação, autorização por empresa, validação de payload, erros sem detalhe interno, CORS compartilhado, busca de usuário por e-mail em vez de listagem paginada;
- senha provisória forte única em `supabase/functions/_shared/provisional-password.ts` e `must_change_password` sempre marcado;
- `ColaboradorAcessoPanel` e `PrimeiroAcesso.tsx`: mensagem única, cópia só da senha, exigência de troca;
- migração: `auth_user_security_state` com registro de emissão/troca e revogação do EXECUTE da rotina legada de senha, se existir; rollback fornecido.

Entrega da Fase 1 no formato pedido (diagnóstico, alterações, arquivos, migrations, testes, evidências, rollback, pendências) e parada para aprovação.
