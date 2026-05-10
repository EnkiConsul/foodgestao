## Objetivo

No diálogo de novo/editar Lançamento, permitir criar rapidamente uma **Conta**, **Categoria**, **Cliente/Fornecedor** ou **Forma de Pagamento** sem sair da tela, reaproveitando os formulários já existentes.

## Comportamento

Ao lado de cada Select correspondente, será adicionado um pequeno botão `+` (ícone `Plus`, variante ghost/outline). Ao clicar:

1. Abre o dialog de cadastro do recurso (já existente).
2. Após salvar com sucesso, o dialog fecha, a lista do Lançamento é recarregada e o item recém-criado fica **automaticamente selecionado** no Select.
3. O dialog do Lançamento permanece aberto, com os demais campos preservados.

Aplicado a:

- **Conta** (origem e destino na transferência) → `AccountFormDialog`
- **Categoria** → `CategoryFormDialog`
- **Cliente/Fornecedor** → `ContactFormDialog`
- **Forma de Pagamento** → `PaymentMethodFormDialog`

## Detalhes técnicos

Arquivo único alterado: `src/components/transactions/TransactionFormDialog.tsx`.

1. Adicionar 4 estados booleanos para abrir cada subdialog: `accountDialogOpen`, `categoryDialogOpen`, `contactDialogOpen`, `paymentMethodDialogOpen`.
2. Refatorar o `loadData` em uma função reutilizável (`reloadLookups`) para poder ser chamada após a criação de qualquer recurso.
3. Cada subdialog precisa de um callback `onCreated` que retorne o `id` do novo registro. Verificar se os dialogs já expõem isso; se não, adicionar um parâmetro opcional `onCreated?: (id: string) => void` (mudança mínima e retrocompatível).
4. No callback: chamar `reloadLookups()` e setar o estado correspondente (`setAccountId`, `setCategoryId`, etc.) com o novo id.
5. Layout: envolver cada `Select` num `flex gap-2`, com o botão `+` (`size="icon"`, `variant="outline"`, `h-10 w-10`) ao lado direito. Tooltip "Criar nova conta", etc.
6. Respeitar o contexto atual (PF/PJ) — os subdialogs já recebem `contextType`/`selectedCompanyId` via seus próprios hooks; o filtro de visibilidade é reaplicado no `reloadLookups`.

## Não incluído

- Sem alterações no schema do banco.
- Sem mudanças em RLS ou edge functions.
- Sem refactor visual fora do `TransactionFormDialog`.