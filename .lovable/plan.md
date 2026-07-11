## Objetivo
Permitir buscar (filtrar por digitação) no campo **Conta Contábil** dentro do formulário de Categoria — hoje é um Select simples, o que fica ruim quando há dezenas/centenas de contas contábeis.

## Alteração

### `src/components/categories/CategoryFormDialog.tsx`
- Substituir o `Select` do campo "Conta Contábil" por um **Combobox** (Popover + Command) usando os componentes shadcn já existentes (`@/components/ui/popover`, `@/components/ui/command`).
- Componente:
  - Botão `PopoverTrigger` mostra o label da conta selecionada (`código — nome`) ou "Nenhuma".
  - `CommandInput` para digitar (busca em `código` **e** `nome`, case-insensitive).
  - `CommandList` com `CommandItem` para "Nenhuma" + cada conta contábil.
  - Fecha ao selecionar e atualiza `chartAccountId`.
- Manter a mesma query e filtros já existentes (`context`, `is_active`, `allow_transactions`, ordenado por `code`).
- Mantém o hint quando não há contas cadastradas.

## Fora de escopo
- Nenhuma mudança no banco, no Select de "Categoria Pai" ou em outros formulários.