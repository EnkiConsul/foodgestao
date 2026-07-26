# Ajustes finais da página `/mais`

## 1. Personalizar atalho — mostrar todas as telas do módulo

**Problema:** o customizer só lista `shortcutOptions` (curados) — 7 itens no DP, por exemplo. Faltam a maioria das telas dos submenus (Cadastro, Folgas, Documentos, Comunicação).

**Correção em `src/hooks/useModuleShortcut.ts`:** deixar de usar `config.shortcutOptions` como fonte e passar a derivar dinamicamente de `config.moreGroups`, achatando `items` + `subgroups[].items`, excluindo o grupo "Conta" (para não misturar contexto) e deduplicando por `to`. Retornar essa lista em `options`.

Assim `MobileBottomNav > ShortcutCustomizer` passa a exibir **todas** as telas do módulo ativo, mantendo o slot "esquerdo/direito" e o marcador "Em uso".

## 2. Tiles do `/mais` — sem quebra feia nem nome oculto

**Problema:** `line-clamp-2` + fonte 11px em 4 colunas cortam nomes longos ("Contracheques", "Adiantamentos", "Contas Bancárias") e sobrepõem visualmente.

**Correção em `src/components/mobile/MoreGroupSection.tsx`:**
- Fixar grid em **3 colunas** para todos os submenus (mais respiro horizontal).
- Aumentar altura do tile e o `gap-y` (16 → 20 px).
- Rótulo: remover `line-clamp-2` e `min-h-[26px]`; usar `text-[11.5px] leading-[1.15] break-words hyphens-auto` com **até 3 linhas** visíveis (`max-h` livre) e sem `truncate`.
- Ícone continua num círculo 48px; padding horizontal do tile sobe de `px-2` para `px-1.5` para dar mais largura ao texto.
- Em uma linha incompleta (ex.: 4 itens em grid de 3), manter `flex-wrap justify-center` para centralizar os órfãos.

## 3. Botão "Personalizar Barra" — sem estouro

**Problema:** dentro do `grid-cols-2` o rótulo `Personalizar Barra` + ícone excede a largura de metade da tela em 393 px.

**Correção em `src/pages/Mais.tsx`:** trocar o `grid-cols-2` por um **stack vertical**:
- Botão "Personalizar Barra" ocupa 100% da largura (linha única, com ícone à esquerda e rótulo, `justify-start` sem `truncate`).
- Botão "Sair" abaixo, também 100% da largura, mantido em vermelho.
Isso remove o overflow definitivamente sem encurtar o rótulo.

## 4. Header do módulo fixo, sem empresa redundante

**Problema:** o `MoreHeader` mostra a empresa como título principal (redundante com a topbar fixa acima, que já tem o seletor de empresas) e o nome do módulo em caps pequeno; além disso, se o container não permitir sticky, ele rola junto.

**Correção em `src/components/mobile/MoreHeader.tsx`:**
- Título único e grande: **nome do módulo** (`MODULE_LABEL[activeModule]`, ex.: "DP 360°"), sem subtítulo de empresa.
- Manter subtítulo apenas em casos onde ajuda a orientar (ex.: "Menu completo") — texto pequeno em `text-muted-foreground`, opcional. Sem `Pakere Pizzaria` aqui.
- Ajustar posicionamento para `sticky top-0 z-20` **e** garantir na página `/mais` que o container pai não tenha `overflow-hidden` (verificar `MobileShell`/`DpShell` — se necessário elevar o `sticky` para o wrapper correto ou trocar por `position: sticky` com o cálculo do offset já embutido no CSS variable existente do topbar).

## Detalhes técnicos

- `useModuleShortcuts` continua bloqueando colisão entre slot A e B; ao aumentar o universo de opções, isso só afeta a lista exibida no `Sheet`.
- Se algum item novo do universo não tiver `icon` (não é o caso hoje, mas por segurança), cair para `LayoutGrid`.
- Não altero `MODULE_NAV`; apenas o hook e os componentes visuais. `shortcutOptions` continua existindo para eventual fallback, mas o customizer passa a ignorá-lo.
- Testes visuais: `/mais` no DP (Pakere Pizzaria), `/mais` no Financeiro e Portal do colaborador em 393×852.

## Arquivos afetados

- `src/hooks/useModuleShortcut.ts` — derivar `options` de `moreGroups`.
- `src/components/mobile/MoreGroupSection.tsx` — grid 3 col fixo, rótulo até 3 linhas, sem truncate.
- `src/pages/Mais.tsx` — stack vertical dos botões de rodapé.
- `src/components/mobile/MoreHeader.tsx` — módulo como título único, sticky, sem empresa.
