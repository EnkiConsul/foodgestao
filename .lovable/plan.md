## Diagnóstico

Olhando os logs de rede do preview, **todas** as requisições à tabela `profiles` estão retornando **HTTP 403** com:

```json
{ "code": "42501", "message": "permission denied for function is_company_member" }
```

### Causa raiz

A tabela `profiles` tem uma política de RLS chamada **"Company members can view member profiles"** que chama `private.is_company_member(auth.uid(), ...)`. Eu verifiquei as permissões do schema `private`:

```
                        proname             |  acl
 -----------------------------------------+---------------------
  is_company_member                       | postgres=X/postgres
  is_company_admin_or_owner               | postgres=X/postgres
  get_user_company_ids                    | postgres=X/postgres
  get_company_role                        | postgres=X/postgres
```

Apenas o role `postgres` tem `EXECUTE`. O role `authenticated` (que executa as queries do app) **não** tem permissão de executar nenhuma função do schema `private`. Mesmo essas funções sendo `SECURITY DEFINER`, o caller ainda precisa de `EXECUTE` para chamá-las.

Como em Postgres, se **qualquer** política permissiva de uma tabela disparar erro durante a avaliação, a query inteira falha (42501), todo SELECT em `profiles` está sendo barrado — inclusive o do próprio dono da linha (que deveria passar pela política "Users can view own profile").

### Por que isso te prende em /onboarding

1. `ProtectedRoute` (em `src/App.tsx`) faz `select onboarding_completed from profiles` ao montar `/`.
2. Resposta 403 → `data` é `undefined` → o código faz `data?.onboarding_completed ?? false` → trata como **não concluído** → `Navigate to="/onboarding"`.
3. Em `/onboarding`, a página tenta carregar o perfil também → 403 → fica em estado degradado, e mesmo clicando em "Liberar Dashboard" o `UPDATE` em `profiles` retorna 403 pelo mesmo motivo. `navigate("/")` até roda, mas o ProtectedRoute imediatamente devolve para `/onboarding`. Loop infinito.

As mesmas políticas existem em `accounts`, `companies`, `transactions`, `transaction_attachments` e `company_members`, então o problema vai além do onboarding — provavelmente várias telas estão quebradas silenciosamente.

## Plano de correção

**Migração SQL única** concedendo as permissões mínimas necessárias ao role `authenticated`:

```sql
GRANT USAGE ON SCHEMA private TO authenticated;

GRANT EXECUTE ON FUNCTION private.is_company_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_company_admin_or_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_user_company_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_company_role(uuid, uuid) TO authenticated;
```

Isso é seguro porque:
- As funções são `SECURITY DEFINER` e encapsulam apenas leituras controladas em `company_members`.
- Não exponho as outras funções (`manage_audit_logs_partitions`, `apply_audit_log_partition_policies`) porque são administrativas — elas continuam restritas ao `postgres`.
- O schema `private` continua isolado; apenas dou USAGE para que as funções listadas sejam alcançáveis.

## Validação após o fix

1. Recarregar `/` logado: deve ir direto para o Dashboard (perfil já tem `onboarding_completed=true`).
2. Resetar onboarding via Configurações → "Resetar onboarding" → cair em `/onboarding`, completar checklist, clicar **Liberar Dashboard** → ir para `/` e permanecer.
3. Conferir os logs de rede: nenhuma resposta 403 com `42501` em `profiles`, `accounts`, `transactions`, `companies`.

## Observações

- O fallback `?? false` no `ProtectedRoute` é frágil: ele esconde erros de RLS tratando-os como "onboarding não concluído". Numa próxima passada, vale ajustar para distinguir erro de permissão de "perfil sem flag" e mostrar uma mensagem útil em vez de redirecionar em loop. Não incluo essa mudança nesta correção para manter o escopo focado no bloqueio atual.
