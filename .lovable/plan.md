## Problema

Ao salvar um lançamento **PJ** com categoria, a trigger `learn_categorization_rule` tenta inserir uma nova regra em `categorization_rules` com:

- `scope = 'user'`
- `user_id = NEW.user_id`
- `company_id = NEW.company_id` (**não-nulo em PJ**)

A CHECK constraint `scope_ownership` exige:

- `scope='user'` → `company_id IS NULL`
- `scope='company'` → `company_id IS NOT NULL`

Como em PJ `company_id` está preenchido, a inserção viola a constraint e o cadastro falha com:

```
new row for relation "categorization_rules" violates check constraint "scope_ownership"
```

## Correção (migration SQL)

Reescrever a função `public.learn_categorization_rule()` para escolher o escopo conforme o contexto:

- Se `NEW.company_id IS NOT NULL` → `scope='company'` (mantém `user_id` como autor da correção, permitido pela constraint).
- Caso contrário (PF) → `scope='user'` com `company_id = NULL`.

Aplicar a mesma lógica na busca por regra existente (`SELECT ... WHERE scope = ...`) para não duplicar regras e permitir corrigir a categoria pela via correta.

Nenhuma alteração no frontend — o bug é 100% backend.

## Verificação

1. Rodar a migration.
2. No app, criar um lançamento PJ com categoria → deve salvar sem erro.
3. Consultar `categorization_rules` e confirmar que a regra criada tem `scope='company'` e `company_id` preenchido.
4. Repetir para PF → regra `scope='user'`, `company_id NULL`.