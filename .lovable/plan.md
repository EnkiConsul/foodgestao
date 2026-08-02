## Problema

A tela de Conciliação Open Finance (`/contas-bancarias/conciliacao`) foi construída só para desktop: uma tabela de 9 colunas dentro de `overflow-x-auto`, KPIs em `grid-cols-3` fixo, filtros com larguras fixas (`w-[220px]`, `w-[160px]`, `w-[240px]`) e barra de ações em linha única. No celular isso gera rolagem horizontal e controles cortados — não há nenhum uso de `useIsMobile` nem de breakpoints (`sm:`/`md:`) na página.

## O que fazer

1. **Cabeçalho**: empilhar título e botão "Sincronizar" no mobile (`flex-col` → `sm:flex-row`), título `text-xl sm:text-2xl`, botão full-width no mobile.
2. **KPIs**: `grid-cols-3` → `grid-cols-1 sm:grid-cols-3` (ou manter 3 compactos com fonte reduzida no mobile).
3. **Filtros**: selects e busca em coluna no mobile (`w-full sm:w-[220px]` / `sm:w-[160px]`), busca ocupando a linha inteira.
4. **Barra de ações em lote**: no mobile, contador em cima, botões "Ignorar"/"Confirmar" em grid de 2 colunas full-width, select de transferência full-width.
5. **Lista de lançamentos** — renderização condicional por dispositivo usando `useIsMobile` (`src/hooks/use-mobile.tsx`), mantendo a tabela atual intacta para `md+`:
   - Novo componente `src/components/conciliacao/StagingCard.tsx` para o mobile: card por lançamento com checkbox + data + valor colorido no topo, descrição, e os mesmos controles (Conta destino, Tipo, Categoria/Contraparte) empilhados em largura total, badges de status e botões Confirmar/Ignorar no rodapé do card.
   - Reaproveitar exatamente a mesma lógica/estado já existente (`rowAccount`, `rowKind`, `rowCounterpart`, `handleRowAction`, grupos "Sugeridas"/"Outras categorias (estorno)", regras de categoria inativa) — nenhuma mudança de regra de negócio.
6. **Extrair a linha da tabela** para `StagingRow.tsx` (opcional, se ajudar a compartilhar os seletores entre card e linha) sem alterar comportamento.

## Detalhes técnicos

- Somente mudanças de apresentação: nada de alterações em RPCs (`pluggy_confirm_staging`, `pluggy_confirm_staging_transfer`), queries ou triggers.
- Sem cores hardcoded: usar tokens já usados na página (`text-success`, `text-destructive`, `text-warning`, `bg-muted/40`).
- Verificação: capturar screenshots via Playwright em 390px, 768px e 1280px para confirmar ausência de rolagem horizontal e legibilidade dos controles.

## Fora do escopo

Se outras telas também estiverem sem adaptação por dispositivo, avise quais — este plano cobre a Conciliação.