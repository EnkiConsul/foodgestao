# Por que o botão de criar conta contábil fica "travado"

## Causa confirmada

No diálogo de conta contábil (`ChartAccountFormDialog`), o botão de gravar está desabilitado por:

```
disabled={saving || !name.trim() || !code.trim()}
```

O campo `code` (índice hierárquico) só é preenchido quando se **edita** uma conta — na criação ele é gerado pelo banco (trigger). Ou seja, ao abrir "Nova Conta" o `code` está vazio e o botão "Criar Conta" nunca habilita: fica estático, sem clique, sem mensagem de erro. Em edição funciona normalmente, o que explica a sensação de "só em alguns casos/logins".

Achado secundário verificado no banco: a tabela `chart_accounts` não possui GRANTs para os papéis da API de dados (só existe a política RLS do proprietário). Sem os GRANTs, contas contábeis podem simplesmente não carregar ou falhar em salvar para parte dos usuários, mesmo com o botão liberado.

## Correção proposta

1. Remover a condição `!code.trim()` do botão, mantendo `saving` e `!name.trim()`. Em edição nada muda (o código continua exibido, apenas não bloqueia).
2. Conceder os GRANTs da API de dados em `chart_accounts` (leitura/escrita para usuários autenticados, acesso total para o papel de serviço), sem alterar a RLS existente que já restringe cada linha ao proprietário.

## Validação

- Abrir `/contas-contabeis`, clicar em "Nova Conta", preencher só o nome e confirmar que o botão habilita e a conta é criada com o índice gerado automaticamente.
- Criar uma conta filha a partir de uma conta sintética e editar uma conta existente para garantir que nada regrediu.

## Detalhes técnicos

- `src/components/chart-accounts/ChartAccountFormDialog.tsx`: ajuste na prop `disabled` do botão de submit.
- Migração: `GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_accounts TO authenticated;` e `GRANT ALL ... TO service_role;` (sem `anon`, pois a política é escopada por `auth.uid()`). Verificar também `chart_account_companies`, usada no mesmo fluxo de salvamento.
