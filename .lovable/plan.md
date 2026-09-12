# Cabeçalho mobile enxuto, cards de subtelas, favoritos e alinhamento do rodapé

Quatro ajustes na experiência mobile do Pessoas 360°.


## 1. Cabeçalho mobile sem informações encavaladas

Hoje o cabeçalho mobile (`src/components/dp/DpHeader.tsx`) empilha: voltar, gatilho da sidebar, chip do módulo (`ModuleSwitcherChip`), seletor de empresa, favorito e sino — tudo disputando a mesma linha.

- No mobile, remover o `ModuleSwitcherChip` do cabeçalho (a troca de módulo já existe no atalho do Hub nos atalhos da tela inicial). Ele continua disponível no desktop se aplicável.
- Resultado no mobile: apenas **voltar** (quando aplicável), **seletor de empresa**, **favoritar** e **alertas** — sem encavalamento.
- Desktop permanece como está (inclui botão Hub e demais itens).

## 2. Descrição dos cards de subtelas sempre com 2 linhas preenchidas

Em `src/components/dp/NavigationCard.tsx`, a descrição já ocupa altura fixa de 2 linhas. Novo comportamento: quando a descrição couber em 1 linha, quebrar o texto para que **pelo menos 2 palavras** caiam na segunda linha, evitando a linha vazia.

- Implementar quebra inteligente: se o texto renderizado cabe em uma linha, inserir quebra antes das 2 últimas palavras (via `<wbr>`/span com `block` ou medição simples por contagem de caracteres — solução leve, sem medição de canvas).
- A altura mínima de 2 linhas se mantém, então os cards continuam uniformes mesmo com textos curtos.

## 3. Favorito apenas em telas de uso, não em telas de navegação

Telas principais dos menus (hubs de navegação: Cadastros, Documentos, Comunicação, Rotina, Geral e afins) não devem mostrar o botão de favoritar.

- Em `src/components/dp/favoritablePages.ts`, remover os patterns de hubs de navegação (ex.: `/dp/cadastros`, `/dp/documentos`, `/dp/comunicacao` sem `:id`, `/dp/rotina`, `/dp/geral` se existirem). Telas de uso real (Colaboradores, Folgas, Calendário, Avisos, Mensagens, Disciplinar, Unidades, Cargos, Sindicatos, e todas do portal) continuam favoritáveis.
- `FavoriteToggle` já não renderiza nada quando a rota não é favoritável — nenhuma mudança adicional necessária nele.
- Favoritos já salvos que apontem para hubs deixam de resolver e somem dos atalhos (comportamento já existente em `resolveFavorites`).

## 4. Alinhar ícones do rodapé mobile com o botão "Início"

Na barra inferior (`src/components/mobile/MobileBottomNav.tsx`), os botões laterais (Hub/Folgas, Importar, Mais etc.) ficam encostados na parte inferior, enquanto o botão "Início" está elevado pelo círculo. Isso deixa os ícones desalinhados visualmente.

- Subir os botões laterais para ficarem visualmente alinhados ao centro do botão "Início" (ou reduzir a diferença de altura), sem perder a área de toque mínima de 44 px.
- Ajustar o container dos slots (`items-end justify-around`) para centralizar melhor os itens em relação ao círculo do início.
- Manter o círculo do início elevado e com anel, apenas equalizando a posição vertical dos demais ícones.

## Verificação

- TypeScript e testes existentes.
- Playwright em 393×830: cabeçalho mobile limpo em tela interna e no hub; cards de subtelas com 2 linhas de descrição; hub sem ícone de favorito e tela de uso (ex.: Colaboradores) com favorito; rodapé com ícones laterais alinhados ao botão Início.

