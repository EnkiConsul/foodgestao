# Fix: Categorias somem na ClicSorte — recursão infinita nas policies RLS

## Diagnóstico (confirmado)

A rede mostra `{"code":"42P17","message":"infinite recursion detected in policy for relation \"categories\""}` em `/rest/v1/budgets?select=...category:categories(name)`. Consultei `pg_policies` e confirmei:

- **`categories.SELECT`** faz `EXISTS (SELECT 1 FROM category_companies …)`.
- **`category_companies.SELECT`** faz `EXISTS (SELECT 1 FROM categories …)`.

As duas tabelas se referenciam mutuamente sob RLS → o Postgres detecta recursão e aborta com 42P17. Efeito: qualquer SELECT em `categories` (Categorias, joins do Orçamento, join `category:categories(name)` no widget de metas) falha para todos os usuários — não é específico da ClicSorte, mas ela é a mais afetada porque tem categorias em tabela junção.

O mesmo padrão foi introduzido em **`contacts` ⇄ `contact_companies`** no Bloco G. Ainda não estourou porque nenhum lugar faz join com essa forma, mas está armado para explodir do mesmo jeito assim que a UI de Contatos usar join implícito.

## Causa raiz

O "OR (EXISTS na outra tabela)" foi adicionado para que **o dono da categoria** (quem criou) veja também o vínculo em `category_companies`, e vice-versa. Mas essa checagem cruzada dispara RLS na outra tabela, gerando o ciclo.

## Correção

Quebrar o ciclo com **helpers SECURITY DEFINER em `private`** que consultam a tabela alvo bypassando RLS. As policies passam a chamar a função em vez de fazer EXISTS na outra tabela.

### Novas funções

- `private.user_owns_category(_uid uuid, _category_id uuid) returns boolean`  
  `SELECT EXISTS (SELECT 1 FROM public.categories WHERE id=_category_id AND user_id=_uid)`
- `private.user_owns_contact(_uid uuid, _contact_id uuid) returns boolean` — análogo.
- `private.category_visible_to_member(_uid uuid, _category_id uuid) returns boolean`  
  `SELECT EXISTS (SELECT 1 FROM public.category_companies cc WHERE cc.category_id=_category_id AND private.is_company_member(_uid, cc.company_id))`
- `private.category_editable_by_member(_uid uuid, _category_id uuid) returns boolean` — usa `member_can_edit(..., 'categorias')`.
- `private.contact_visible_to_member` / `private.contact_editable_by_member` — análogos para contatos.

Todas `SECURITY DEFINER`, `STABLE`, `set search_path = public, private`, `REVOKE EXECUTE FROM public` + `GRANT EXECUTE TO authenticated`.

### Policies reescritas

- `categories.SELECT` → `auth.uid() = user_id OR private.category_visible_to_member(auth.uid(), id)`
- `categories.UPDATE/DELETE` → `auth.uid() = user_id OR private.category_editable_by_member(auth.uid(), id)`
- `category_companies.SELECT` → `private.is_company_member(auth.uid(), company_id) OR private.user_owns_category(auth.uid(), category_id)`
- `category_companies.INSERT/DELETE` → `private.member_can_edit(auth.uid(), company_id, 'categorias') OR private.user_owns_category(auth.uid(), category_id)`
- Contacts: mesmo padrão trocando `categoria`→`contato`.

Isso mantém 100% da semântica atual (dono OU membro) e elimina o ciclo, porque a função definer não passa mais por RLS.

## Escopo

- **Migration única** com as 6 funções + DROP/CREATE POLICY nas 4 tabelas.
- **Sem mudança de frontend**: assim que o SELECT em `categories` voltar, a ClicSorte volta a ver suas categorias e o widget de Orçamento para de dar 500.

## Verificação pós-migration

1. `curl` autenticado no endpoint que quebrou (`/rest/v1/budgets?select=...category:categories(name)`) → 200 esperado.
2. Rodar `src/test/rls/categories.rls.test.ts` e `contacts.rls.test.ts` — devem continuar passando (bloqueio anônimo intacto).
3. Ler `categories` em duas contas distintas da ClicSorte para confirmar visibilidade compartilhada.

## Fora de escopo

- Rever o filtro `user_id=eq.<uid>` que o widget de "próximas contas" ainda envia em PJ (aparece no request de `transactions`) — é ruído dos Blocos B, resolvo separado se pedir.
- Warnings de linter preexistentes.
