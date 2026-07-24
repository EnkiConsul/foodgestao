## Problema

O RPC `link_open_finance_account` referencia `companies.owner_id`, mas a tabela `companies` usa `user_id` como coluna do dono. Isso quebra a vinculação da conta Open Finance à conta bancária local com erro `42703: column "owner_id" does not exist`.

## Correção

Migração para recriar `public.link_open_finance_account` trocando a checagem:

```sql
-- antes
WHERE id = _company_id AND owner_id = _uid
-- depois
WHERE id = _company_id AND user_id = _uid
```

Nada mais muda: assinatura, retorno, validações de tipo, `SECURITY DEFINER` e `search_path` permanecem iguais. Depois disso, o botão "Vincular" no `AccountMappingDialog` volta a funcionar para dono da empresa e para membros com papel admin/manager/owner (esse caminho já usa `company_members` corretamente).