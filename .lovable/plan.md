# Dialog de Lançamento responsivo no mobile

## Problema
No viewport mobile (390px), o `DialogContent` do formulário de Novo/Editar Lançamento usa `w-full max-w-lg` sem margens laterais, ficando colado nas bordas, e `max-h-[90vh]` com conteúdo denso — header/footer rolam junto e a digitação fica apertada. O layout não se adapta ao tamanho da tela.

## Escopo
Apenas presentation/UI. Sem mexer em lógica, queries ou schema.

## Mudanças

### 1. `src/components/ui/dialog.tsx` (base)
Ajustar `DialogContent` para ter comportamento responsivo padrão em todo o app:
- Largura: `w-[calc(100%-1rem)]` no mobile (margem lateral de 8px), mantendo `sm:max-w-lg`.
- Padding: `p-4 sm:p-6` (reduz aperto no mobile).
- Altura: adicionar `max-h-[calc(100dvh-2rem)]` por padrão para nunca passar da viewport (usa `dvh` para lidar com barra de endereço no iOS/Android).
- Manter o resto (animações, posicionamento centralizado, `sm:rounded-lg`).

### 2. `src/components/transactions/TransactionFormDialog.tsx`
Reestruturar o `DialogContent` para layout coluna com header fixo, corpo rolável e footer fixo — em vez de rolar o dialog inteiro:
- `DialogContent` recebe `className="sm:max-w-md p-0 gap-0 flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[90vh]"`.
- `DialogHeader` ganha `p-4 sm:p-6 pb-2 border-b shrink-0`.
- `<form>` vira `flex flex-col flex-1 min-h-0`:
  - corpo: `<div class="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">` envolvendo todos os campos.
  - footer de botões (Cancelar / Salvar) vai para `<div class="p-4 sm:p-6 pt-3 border-t shrink-0">` ao final do form (não-scroll), com botões `w-full sm:w-auto` empilhados no mobile.
- Garantir que grids internos (ex.: data/competência lado a lado) usem `grid-cols-1 sm:grid-cols-2` quando aplicável para evitar overflow no 390px.

### 3. Verificações rápidas
- Conferir visualmente nos viewports 390x844 e 768x1024 que o dialog respeita as margens, rola apenas o corpo, e os botões ficam sempre visíveis.
- Confirmar que os dropdowns `SearchableSelect` continuam abrindo dentro do dialog sem cortar.

## Fora de escopo
- Outros dialogs do app (faremos apenas o de Lançamento agora; o ajuste em `dialog.tsx` já melhora todos passivamente, sem reestruturar layout interno deles).
- Conversão para `Sheet`/drawer full-screen no mobile — pode ser uma próxima iteração se você quiser experiência tipo app nativo.
