# Responsividade mobile em toda a plataforma

## Problema
O `DialogContent` base já foi ajustado para o `TransactionFormDialog`, mas outros dialogs e telas continuam com problemas no mobile (390px):
- `AlertDialog` não recebeu os ajustes (sem margem lateral, padding fixo `p-6`, sem safe-area, sem `max-h` por viewport).
- Dialogs filhos com formulários longos (Categoria, Conta, Contato, Empresa, Forma de Pagamento, Orçamento, Pagamento, Editor de Plano) podem ser cortados porque o base hoje força `overflow-hidden`.
- Vários grids usam `grid-cols-2/3/4` sem variante responsiva e estouram a largura no celular (ex.: Orçamento, Lançamentos, Editor de Plano, Cupons, Webhooks Asaas, Pagamento).
- `Sheet` (sidebar mobile e filtros) não respeita `safe-area-inset` nem `--vvh`.

## Escopo
Apenas UI/presentation. Sem mexer em lógica, queries ou schema.

## Mudanças

### 1. `src/components/ui/dialog.tsx` (base)
- Trocar `overflow-hidden` por `overflow-y-auto overscroll-contain` no `DialogContent` para permitir scroll interno quando o conteúdo do filho passa do `max-h`.
- Manter `w-[calc(100%-1rem)] sm:max-w-lg`, `p-4 sm:p-6`, `max-h-[calc(var(--vvh,100dvh)-2rem-safe-area)]`, `rounded-lg` em todas as larguras.

### 2. `src/components/ui/alert-dialog.tsx`
Aplicar o mesmo tratamento responsivo do `DialogContent`:
- `w-[calc(100%-1rem)] max-w-lg`, `p-4 sm:p-6`, `rounded-lg` (em vez de só `sm:rounded-lg`).
- `max-h-[calc(var(--vvh,100dvh)-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-y-auto`.
- `[padding-top:max(1rem,env(safe-area-inset-top))]` e equivalentes para inset-bottom.
- `AlertDialogFooter`: adicionar `gap-2` para empilhamento limpo no mobile.

### 3. `src/components/ui/sheet.tsx`
- `SheetContent` lado `bottom`/`top`: adicionar safe-area no padding e `max-h-[calc(var(--vvh,100dvh)-1rem)] overflow-y-auto`.
- Lado `left`/`right` em mobile: largura padrão `w-[85vw] sm:max-w-sm` em vez de `w-3/4`, e `overflow-y-auto`.

### 4. Dialogs filhos — remover `max-h-[90vh] overflow-y-auto` redundante
Agora que o base já cuida disso, simplificar para evitar conflito de classes:
- `src/components/categories/CategoryFormDialog.tsx`
- `src/components/contacts/ContactFormDialog.tsx`
- `src/components/budgets/BudgetFormDialog.tsx`
- `src/components/admin/PlanEditorDialog.tsx`

### 5. Grids não-responsivos
Trocar `grid-cols-N` por `grid-cols-1 sm:grid-cols-N` (ou `grid-cols-2 sm:grid-cols-N` para KPIs) nos seguintes pontos:
- `src/pages/Orcamento.tsx` (linha 121, `grid-cols-3` → `grid-cols-1 sm:grid-cols-3`)
- `src/pages/Lancamentos.tsx` (linha 767, `grid-cols-2 md:grid-cols-5` mantém — KPIs OK)
- `src/components/bills/PaymentDialog.tsx` (linha 110, `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`)
- `src/components/admin/PlanEditorDialog.tsx` (linhas 68, 124, 146 — `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`)
- `src/components/admin/AdminCoupons.tsx` (linha 105)
- `src/components/admin/AdminAsaasWebhooks.tsx` (linhas 249, 310)

### 6. Verificações rápidas
- Abrir cada dialog principal nos viewports 390x844 e 768x1024 confirmando:
  - Respeita margens laterais e safe-area.
  - Rola apenas o corpo do dialog, sem rolar a página atrás.
  - Botões de footer (Cancelar/Salvar/Confirmar) sempre visíveis.
- Verificar que `Sheet` (menu lateral mobile) abre e fecha sem cortar conteúdo.

## Fora de escopo
- Tabelas grandes com `overflow-x-auto` já existente (Lançamentos, Relatórios) — funcionam, embora não ideais. Próxima iteração pode converter em cards no mobile.
- Conversão de dialogs em drawer full-screen no mobile (padrão app nativo) — pode ser próxima iteração.
- Landing page já está responsiva.
