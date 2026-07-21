## Objetivo
Permitir que o admin da empresa, no módulo DP, defina uma senha customizada para qualquer colaborador (além do reset automático para 6 últimos do CPF que já existe).

## Backend

**Nova Edge Function `dp-alterar-senha-colaborador`** (`supabase/functions/dp-alterar-senha-colaborador/index.ts`):

- Requer `Authorization: Bearer <jwt>` — valida via `supabase.auth.getUser(token)`. Sem token → 401.
- Body validado com Zod: `{ colaborador_id: uuid, nova_senha: string (6..72 chars) }`.
- Autorização server-side (nunca confiar em campos do cliente):
  1. Carrega o colaborador (`dp_colaboradores`) pelo `colaborador_id` e obtém `company_id` + `user_id` (usuário auth do colaborador).
  2. Confere que o chamador é admin/owner da mesma empresa via `private.is_company_admin_or_owner(company_id)` (mesma função já usada nas políticas atuais). Sem permissão → 403.
  3. Bloqueia auto-alteração: se `colaborador.user_id === caller.id` → 400 ("use a tela do próprio perfil").
- Ação: `admin.updateUserById(colaborador.user_id, { password: nova_senha })` com o service role.
- Registra em `audit_logs` a ação `dp_admin_password_change` (sem gravar a senha).
- CORS padrão, retorno `{ success: true }`.

Nada é gravado com `NULL` em ownership; a operação apenas atualiza a senha do usuário do colaborador — o `owner_id` das tabelas do domínio não é tocado.

## Frontend

**`src/pages/dp/DpColaboradores.tsx`**:
- Adicionar terceira ação na coluna (visível apenas quando `colaborador.user_id` existe), ícone `KeyRound`/`Lock`, tooltip "Definir senha".
- Novo dialog `DefinirSenhaDialog` (componente inline ou em `src/components/dp/DefinirSenhaDialog.tsx`) com:
  - Input "Nova senha" (mínimo 6, máximo 72, com toggle mostrar/ocultar).
  - Input "Confirmar senha".
  - Botão "Gerar senha aleatória" (12 chars alfanuméricos).
  - Validação Zod local antes de enviar.
  - Chamada `supabase.functions.invoke("dp-alterar-senha-colaborador", { body })`.
- Ao sucesso, reaproveita o modal `accessResult` já existente (variante `password_set`) exibindo CPF do colaborador + a senha definida, com botões de copiar — mantendo o padrão visual do "Gerar acesso"/"Reset".

## Segurança
- Autorização feita 100% no servidor a partir do JWT (nunca do body).
- Colaboradores comuns não têm acesso à Edge Function (retorna 403 quando `is_company_admin_or_owner` é falso).
- Rate limit simples in-memory (5 requisições/min por caller) para reduzir abuso.
- Nenhuma senha é logada; apenas o evento em `audit_logs`.

## Verificação
- `curl_edge_functions` com JWT de admin válido → 200 e senha efetivamente trocada (testar login em seguida via `signInWithPassword`).
- `curl_edge_functions` sem JWT → 401.
- Chamada como usuário comum (não admin) → 403.
- Chamada para colaborador de outra empresa → 403.

## Fora de escopo
- Não altera o fluxo `dp-reset-password` (permanece para reset ao padrão CPF).
- Não altera políticas RLS existentes.
