## Calendários mobile 100% em lista vertical

O calendário mostrado no print é o da tela **/dp/folgas** (`DpFolgas.tsx`), que tem seu próprio grid inline `grid-cols-7` — o `CalendarioMobileLista` só havia sido plugado em **/dp/calendario** (admin) e **/dp/portal/calendario** (colaborador). Vou padronizar todos os calendários mobile do 360°FOOD para exibir uma linha por dia.

### 1. `src/pages/dp/DpFolgas.tsx` — trocar o grid mobile por lista
- Envolver o `<div className="grid grid-cols-7 ...">` atual em `<div className="hidden md:block">` (mantém a experiência desktop igual).
- Adicionar, logo abaixo, um bloco `<div className="md:hidden">` renderizando uma lista vertical construída a partir do mesmo `eventsByDay` / `blockedByDate` / `capacityByDay` já calculados na página. Cada linha:
  - Coluna esquerda: dia da semana abreviado (Dom/Seg/…) + número do dia (destaque para hoje, esmaecido para dias sem eventos).
  - Coluna central: chips coloridos por status/tipo (Bloqueado, Lotado `x/y`, Parcial `x/y`, evento por colaborador — reaproveitando as cores já usadas no grid: destructive, red, emerald, amber, violet, blue, slate).
  - Chevron à direita indicando ação de abrir o `openDay(day)`.
- Filtrar dias fora do mês (`inMonth`) — a lista deve conter apenas os dias do mês corrente exibido.
- Preservar `CalendarSkeleton` no estado `isLoading` (funciona em ambas as views).

### 2. `src/components/dp/CalendarioMobileLista.tsx` — sem mudanças
Já é usado em `/dp/calendario` e `/dp/portal/calendario` sob `md:hidden`. Nenhuma alteração necessária.

### 3. Outros grids semanais (fora de escopo — não são calendários de navegação)
- `src/components/dp/bloqueios/RegraDialog.tsx`: mini-grade de seleção de dias dentro de um modal de regra — **não é um calendário** de leitura de eventos, é um seletor tipo "escolha um dia do mês". Manter como está.
- `src/components/dp/DpSkeletons.tsx`: skeleton visual do grid desktop. Manter (só aparece em `hidden md:block`).

### Detalhes técnicos
- Reaproveitar o vocabulário de cores/chips já presente em `DpFolgas.tsx` (linhas 860–890) para preservar consistência de significado entre desktop e mobile.
- Nenhuma alteração em queries, hooks ou dados — apenas apresentação.
- Um único `tsgo --noEmit` no final para garantir tipagem.