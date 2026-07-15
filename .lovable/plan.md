# Por que rcbruto77 foi para /dp/meu

O `RootGate` redireciona para `/dp/meu` sempre que a RPC `is_dp_colaborador(user)` retorna `true`. Investigando:

1. `is_dp_colaborador` **não olha** a tabela `dp_colaboradores` — ela só faz `SELECT ... FROM user_roles WHERE role = 'dp_colaborador'`.
2. O usuário `rcbruto77@gmail.com` tem **duas linhas** em `user_roles`:
   - `super_admin` (14/02/2026 — legítima)
   - `dp_colaborador` (14/07/2026 — **resíduo dos testes** `PAKERE_` / `TESTE_E2E_` que rodamos na limpeza anterior)
3. Não existe nenhum registro em `dp_colaboradores` com o `user_id` ou o e-mail dele — a role virou órfã depois da limpeza dos `PAKERE_*`.

Ou seja, ele é super_admin e dono das empresas ClicSorte e Raptor, mas a role órfã força o portal. Além disso, a regra que você escolheu ("só é colaborador em empresas onde NÃO é owner/admin") não está implementada em lugar nenhum hoje.

---

# Plano

## 1. Limpar a role órfã do rcbruto77
Deletar de `user_roles` a linha `role = 'dp_colaborador'` do usuário `7432cb5e-27ef-4189-b903-43d133aaa541`. Isso resolve o sintoma imediato — próximo login vai direto para `/hub`.

## 2. Varrer outras roles `dp_colaborador` órfãs
Após a limpeza dos `PAKERE_*` da rodada passada podem ter sobrado outras. Deletar de `user_roles` toda linha `role = 'dp_colaborador'` cujo `user_id` **não** aparece em `dp_colaboradores` (por `user_id` nem por e-mail via `auth.users`).

## 3. Corrigir `is_dp_colaborador` para refletir a regra escolhida
Reescrever a função para retornar `true` somente se existir vínculo **efetivo** em `dp_colaboradores` numa empresa onde o usuário **não** é owner nem admin/owner via `company_members`. Regra em SQL (SECURITY DEFINER, search_path fixo):

```text
EXISTS colaborador C em dp_colaboradores tal que:
   C.user_id = _user_id  OR  lower(C.email) = lower(auth.email de _user_id)
AND NOT EXISTS empresa dele:
   companies.user_id = _user_id AND companies.id = C.company_id
AND NOT EXISTS company_members M:
   M.user_id = _user_id AND M.company_id = C.company_id AND M.role IN ('owner','admin')
```

Efeitos colaterais previstos:
- `RootGate`, `PortalProtected` e `ColaboradorShell` (que já chamam a mesma RPC) passam a respeitar a nova regra sem alteração de código.
- `dp_colaborador_of` — usada no portal para descobrir "qual colaborador sou eu" — precisa aplicar o mesmo filtro para não permitir que um owner acesse `/dp/meu` de uma empresa própria. Vai ser ajustada na mesma migração.

## 4. Sincronização automática da role (opcional, mas recomendado)
Trigger em `dp_colaboradores` (AFTER INSERT/UPDATE/DELETE) que insere/remove a role `dp_colaborador` em `user_roles` de acordo com o vínculo real, para evitar que resíduos de testes reapareçam no futuro. Sem esse trigger, uma reinstalação da role via seed volta a quebrar. Se preferir manter só a limpeza pontual (itens 1–3) e cuidar disso no futuro, eu removo esse item.

## 5. Verificação
- Rodar `is_dp_colaborador('7432cb...')` — deve retornar `false`.
- Contar quantas roles `dp_colaborador` órfãs sobraram — deve ser 0.
- Simular login do rcbruto77: o `RootGate` deve navegar para `/hub`.

---

# Detalhes técnicos

**Arquivos tocados:**
- 1 migração SQL:
  - `DELETE FROM user_roles WHERE role = 'dp_colaborador' AND user_id NOT IN (SELECT user_id FROM dp_colaboradores WHERE user_id IS NOT NULL UNION SELECT u.id FROM auth.users u JOIN dp_colaboradores c ON lower(c.email) = lower(u.email))`
  - `CREATE OR REPLACE FUNCTION public.is_dp_colaborador(...)` com a nova lógica (STABLE, SECURITY DEFINER, `SET search_path = public`, sem SQL dinâmico — em conformidade com `@security-memory`).
  - `CREATE OR REPLACE FUNCTION public.dp_colaborador_of(...)` com o mesmo filtro anti-owner.
  - (Item 4) `CREATE OR REPLACE FUNCTION public.sync_dp_colaborador_role()` + `CREATE TRIGGER` em `dp_colaboradores`.

**Sem alterações no frontend** — a lógica está toda no banco.

**Compatibilidade:** colaboradores legítimos que existem em `dp_colaboradores` e não são owner/admin da empresa vinculada continuam entrando no portal normalmente.
