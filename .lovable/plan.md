## Objetivo

Permitir seleção múltipla de lançamentos na tabela de `/lancamentos` para exclusão em massa e edição em massa de campos comuns.

## Mudanças

### 1. Seleção múltipla na tabela (`src/pages/Lancamentos.tsx`)

- Novo state `selectedIds: Set<string>`.
- Nova coluna `Checkbox` como primeira coluna em `TableHeader` e `TableBody`:
  - Header: checkbox "select all" que marca/desmarca todos de `displayRows` (ignora linha "SALDO ANTERIOR").
  - Body: checkbox por linha, controla `selectedIds`.
- Linha selecionada recebe `bg-primary/5` para destaque.
- Limpar seleção ao trocar de mês, contexto ou aplicar filtros.

### 2. Barra de ações em massa (flutuante)

Quando `selectedIds.size > 0`, renderizar uma barra fixa na base do conteúdo (sticky, alinhada ao container da tabela) com:

- Texto: `N lançamento(s) selecionado(s)`
- Botão "Limpar seleção"
- Botão `Editar em massa` (abre dialog)
- Botão `Excluir selecionados` (destructive, abre confirmação)

### 3. Exclusão em massa

- Reusar `AlertDialog` simples: "Excluir N lançamentos?" sem opções de série (escopo recorrente fica só para deleção individual).
- Implementação: `supabase.from("transactions").delete().in("id", Array.from(selectedIds))`.
- Audit log com `_action: "transactions_bulk_deleted"` e `_details: { count, ids }`.
- Toast de sucesso + `refreshAll()` + limpar seleção.

### 4. Edição em massa

Novo componente inline `BulkEditDialog` (no mesmo arquivo) com formulário de campos opcionais — só os preenchidos são aplicados:

- **Categoria** (select hierárquico de categorias do contexto atual)
- **Conta bancária** (select)
- **Forma de pagamento** (select)
- **Status** (Pago / A vencer / Cancelado)

Cada campo tem um checkbox "alterar" ao lado; só campos marcados são enviados no `UPDATE`. Implementação:

```ts
const updates: Record<string, any> = {};
if (changeCategory) updates.category_id = newCategoryId;
if (changeAccount) updates.account_id = newAccountId;
if (changePaymentMethod) updates.payment_method_id = newPaymentMethodId;
if (changeStatus) {
  updates.status = newStatus;
  // ajustar payment_date/bill_status conforme regra atual
}
await supabase.from("transactions").update(updates).in("id", Array.from(selectedIds));
```

- Validar que pelo menos um campo foi marcado antes de submeter.
- Audit log `transactions_bulk_updated` com `_details: { count, fields: Object.keys(updates) }`.
- Toast + refresh + limpar seleção + fechar dialog.

## Fora de escopo

- Não permitir edição em massa de: descrição, valor, datas, anexos, recorrência, contato (campos que normalmente são individuais).
- Transferências não terão tratamento especial — se selecionadas junto, o update aplica em todas igualmente (categoria/conta podem não fazer sentido para transferência; o usuário decide).
- Não implementar "selecionar todos os meses" — seleção fica restrita ao que está visível em `displayRows`.

## Arquivos afetados

- `src/pages/Lancamentos.tsx` — seleção, barra de ações, dialog de bulk edit e bulk delete.