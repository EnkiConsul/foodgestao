# Fase 7 — Unificação dos fluxos de acesso do colaborador

## Diagnóstico (verificado agora)

Fluxo oficial (Fase 1), ativo e usado pela tela "Acesso ao portal" do cadastro
(`ColaboradorAcessoPanel`):

| Ação | Função | Situação |
|---|---|---|
| Liberar acesso | `dp-criar-acesso-colaborador` | oficial |
| Redefinir senha | `dp-reset-password` | oficial |
| Bloquear / reativar | `dp-bloquear-acesso-colaborador` | oficial |
| Colaborador cria a senha | `dp-alterar-senha-colaborador` (público, por link) | oficial |
| Situação exibida | RPC `dp_portal_acesso_status` | oficial |

Telas: `ColaboradorAcessoPanel` (gestor), `/ativar-acesso` e `/redefinir-acesso`
(`AtivarAcesso.tsx`, colaborador), `WhatsappComposerDialog` (envio manual do link).
As três ações do gestor autorizam pela empresa do colaborador lida no banco, nunca
pelo corpo do pedido, e os links são de uso único com hash no banco
(ativação 24h, redefinição 30min).

Fluxo legado encontrado: **`dp-invite-colaborador`**. Nenhuma tela o chama, mas
continua publicado e executável. Ele:
- procura conta por e-mail varrendo a lista global de usuários (`listUsers`, 200 por
  página — pode omitir contas e correlaciona cadastros de empresas diferentes);
- vincula automaticamente a conta encontrada ao colaborador, sobrescrevendo
  `user_id`/`email_portal` — caminho paralelo de criação de vínculo, sem os
  controles da Fase 1 (sem link de uso único, sem estado de segurança, sem auditoria);
- cria acesso por convite de e-mail, contrariando a regra de login por CPF.

Também confirmado: `resolve_cpf_login` já está sem permissão para visitante e
usuário comum; `dp-criar-acesso-colaborador` hoje devolve erro genérico quando já
existe conta de autenticação com o mesmo login (não vincula, mas a mensagem não
orienta o administrador).

## O que será feito

1. **Remover o fluxo legado**: apagar a função `dp-invite-colaborador` (código e
   publicação) e sua entrada nas listas de verificação/testes. Nenhum caminho
   alternativo de criação ou vínculo de conta permanece executável.
2. **Conflito de conta com falha fechada e mensagem clara**: em
   `dp-criar-acesso-colaborador`, quando já existir conta de autenticação com o
   login do CPF sem vínculo com este colaborador, não vincular nada, preservar os
   dados e devolver um erro administrativo explicando o que o administrador deve
   fazer (verificar o cadastro duplicado do CPF). O mesmo tratamento para conta
   vinculada a colaborador de outra empresa.
3. **Consolidar a autorização** das quatro ações do gestor num único auxiliar
   compartilhado (empresa lida do banco + dono/administrador ou super
   administrador), eliminando a repetição entre as três funções e garantindo o
   mesmo comportamento.
4. **Grants e permissões**: confirmar que só o endpoint público de criação da
   própria senha aceita visitante, e revogar o que estiver a mais nas rotinas de
   acesso/autenticação apontadas pela verificação de segurança.
5. **Testes** cobrindo os 12 cenários pedidos: liberar, redefinir, bloquear,
   reativar, link expirado, link já usado, duas tentativas simultâneas, colaborador
   de outra empresa, conflito com conta existente, fluxo legado inexistente,
   bloqueado sem acesso ao portal, e ausência de senha definitiva na resposta ao
   gestor.

## Preservado sem alteração

Regras da Fase 1 (gestor nunca vê nem define a senha; link manual por WhatsApp;
24h/30min; uso único; novo link invalida os anteriores; limite de tentativas
persistente; falha fechada; bloqueio efetivo no backend) e a identidade da Fase 3
(sessão → vínculo → colaborador → empresa). Fora do escopo: documentos, folgas,
trocas, férias, convocações, escala, fila/OCR e a interface em geral.

## Detalhes técnicos

- Remoção: `supabase/functions/dp-invite-colaborador/` + `delete_edge_functions`;
  ajuste em `src/test/functions/edge-authz.test.ts` e no relatório de funções.
- `_shared/authz.ts`: novo `requireColaboradorAdmin(req, colaboradorId)` retornando
  colaborador + ator, usado por `dp-criar-acesso-colaborador`, `dp-reset-password` e
  `dp-bloquear-acesso-colaborador`.
- Conflito: consulta pontual por login (`getUserByEmail`/filtro direto), nunca
  listagem global; resposta 409 com código `conflito_cadastro`.
- Testes: `src/test/rls/acesso_colaborador.rls.test.ts` (negações, multiempresa,
  legado ausente) e cenários de token/concorrência em `supabase/tests/`.
- Validações: TypeScript, lint, testes, build, Deno check, migrations:check,
  isolamento multiempresa e security-lint (base 63 críticos; corrigir apenas os de
  acesso/autenticação).
- Reversão: a função legada volta do histórico do repositório; as demais mudanças
  são aditivas e revertíveis por commit.
