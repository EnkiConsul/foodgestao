## Diagnóstico

Confirmei no banco de dados agora:

- **`dp_colaboradores`**: existem **0 registros** na base inteira — nem para o `rcbruto77` nem para qualquer outro usuário. Nenhum colaborador está cadastrado.
- **`user_roles`** do usuário `7432cb5e...` (rcbruto77): apenas `super_admin`. A role órfã `dp_colaborador` já foi removida na migração anterior.
- **`user_roles` role `dp_colaborador`**: 0 linhas em toda a tabela.
- **RPCs**: `is_dp_colaborador('7432cb...')` = `false`, `dp_colaborador_of('7432cb...')` = `NULL`.
- **Triggers em `dp_colaboradores`**: apenas as esperadas (`trg_dp_colab_upd` para `updated_at` e `trg_sync_dp_colaborador_role` para sincronizar a role — nenhuma cria vínculo automaticamente para super_admin).
- **Audit logs**: sem histórico de INSERT em `dp_colaboradores` para esse usuário.

**Conclusão:** sua conta **não está vinculada** a nenhum colaborador do DP no banco. Se o preview ainda mostra `/dp/meu/perfil`, o motivo é um dos seguintes:

1. Você digitou/navegou a URL do portal diretamente (o React Router não bloqueia).
2. O React Query ainda tem em cache `is_dp_colaborador = true` de antes da correção — permanece até refresh forçado ou re-login.

A tela `DpMeuPerfil` só faz `SELECT ... FROM dp_colaboradores WHERE user_id = seu_id`. Como não há registro, ela mostra “Perfil não encontrado”. Não há vínculo real.

## O que corrigir para nunca mais acontecer

### 1. Bloquear rotas `/dp/meu/*` para super_admin e owners
Hoje, o `ColaboradorShell` só valida `is_dp_colaborador`. Se der `false`, exibe "Portal indisponível" — mas ainda é uma tela do portal. Ajuste:

- Em `src/components/dp/ColaboradorShell.tsx`, se `useSuperAdmin()` retornar `true`, redirecionar direto para `/hub` com `<Navigate to="/hub" replace />`.
- Mesma verificação para usuários que são owner/admin de qualquer empresa via `company_members` (opcional — a próxima seção resolve isso mais amplamente).

### 2. Reforçar `RootGate` em `src/App.tsx`
No trecho onde chama `is_dp_colaborador` e navega para `/dp/meu`, adicionar guarda: se o usuário for super_admin **ou** owner de alguma empresa, ignorar o resultado e ir para `/hub`. Isso protege contra qualquer resíduo futuro de role/registro órfão.

### 3. Invalidar cache do React Query no logout
Garantir que ao fazer signOut o `queryClient.clear()` é chamado, para não sobreviver `is_dp_colaborador = true` entre sessões distintas no mesmo dispositivo.

## Arquivos tocados

- `src/components/dp/ColaboradorShell.tsx` — guarda anti-superadmin.
- `src/App.tsx` — reforço no `RootGate`.
- `src/hooks/useAuth.tsx` (ou onde está o `signOut`) — `queryClient.clear()` no logout.

**Sem migrações SQL** — o banco já está consistente.

## Verificação

- Login com `rcbruto77` → deve cair em `/hub`.
- Acessar `/dp/meu/perfil` manualmente → deve redirecionar para `/hub`.
- Logout + login como colaborador legítimo (quando existir) → deve entrar no portal normalmente.
