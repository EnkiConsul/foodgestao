## Ajustes Mobile — Rodada de Polish

### 1. Header /mais — barra "Buscar" e sobreposição
**Problema:** O input encolheu demais (`w-[116px]`) e o header fixo está encavalando visualmente a topbar global.
**Correção em `src/components/mobile/MoreHeader.tsx`:**
- Alinhar o `top` do header com a altura real da topbar global no mobile (mesma variável usada em ambos) para eliminar sobreposição.
- Aumentar altura do header para `h-11` e do input para `h-9`, largura `w-[150px]`, `text-sm`, placeholder "Buscar".
- Usar `bg-background` sólido (sem `/95` translúcido) para não deixar a topbar sangrar por baixo.

### 2. BottomNav — reaparecer no fim da página
**Problema:** O auto-hide esconde a barra ao rolar para baixo mas não reexibe ao chegar no fim.
**Correção em `src/components/mobile/MobileBottomNav.tsx` (`useHideOnScroll`):**
- Detectar `scrollY + innerHeight >= scrollHeight - 8` e forçar `setHidden(false)`.
- Manter o comportamento atual de reexibir no scroll-up e quando `y < 24`.

### 3. Quebra de palavras nos tiles (DP Home e /mais)
**Problema:** Palavras únicas como "Contracheques", "Colaboradores" ainda quebram em duas linhas.
**Correção:**
- `src/pages/dp/DpHome.tsx` e cards compartilhados: aplicar `break-normal`, remover `break-words`/`hyphens-auto`, usar `text-[11px] tracking-tight`.
- Confirmar a mesma regra em `MoreGroupSection.tsx` para rótulos dentro dos subgrupos.

### 4. Hub de Módulos — grid denso (2 colunas mobile)
**Problema:** `/hub` mostra 1 módulo por linha no mobile, desperdiçando espaço.
**Correção em `src/pages/Hub.tsx`:**
- Trocar o grid mobile para `grid-cols-2 gap-3` (mantendo `md:grid-cols-3`+ no desktop).
- Reduzir padding, ícone `h-8 w-8`, título `text-sm font-semibold`, subtítulo `text-[11px] line-clamp-2`.
- Preservar cores/acentos por módulo.

### 5. Calendário mobile em lista — Admin DP + Portal Colaborador
**Problema:** No mobile o grid semanal do DP fica ilegível ("K...", "S...", etc.). O portal também deve seguir o mesmo padrão de lista mostrado no anexo 3.
**Correção nos dois calendários:**
- Admin: `src/pages/dp/DpAdminCalendario.tsx` (grid mensal atual).
- Portal: `src/pages/dp/portal/DpMeuCalendario.tsx` (calendário do colaborador).
- Em ambos, adicionar variante mobile via `md:hidden` (lista) + `hidden md:block` (grid atual preservado).
- Extrair componente compartilhado `src/components/dp/CalendarioMobileLista.tsx` para reuso:
  - Header do mês: `<  Mês AAAA  >` + contador ("X dias úteis" no portal, contagem contextual no admin) à direita.
  - Uma linha por dia do mês:
    - `[Dia semana abrev.] [nº] [chips coloridos de eventos]  >`
    - Chips com nome completo (Folga, Bloqueio, Holerite, Troca, Atestado etc.), sem truncar.
    - Dias sem eventos: apenas número em cinza claro.
  - Toque na linha abre o mesmo drawer/detalhe do dia usado no grid.
- Reusar exatamente os datasets já consumidos por cada tela — apresentação muda, dados não.

### Fora do escopo
- Sem mudanças de RLS, hooks de dados ou lógica de negócio.
- Desktop dos calendários permanece inalterado.

### Ordem de execução
1. Header /mais + auto-hide fim-de-página.
2. Quebra de palavras nos tiles/cards.
3. Hub 2 colunas.
4. Componente `CalendarioMobileLista` + integração no admin e no portal.
