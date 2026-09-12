# Início no celular: seletor de formato, distribuição dos ícones e gesto entre menus

## 1. Seletor de formato dos ícones (Início)

Hoje aparecem três botõezinhos (5, 4, 3). Passa a aparecer só um botão com o formato atual, escrito como `5x1`. Ao tocar, abre um pequeno menu com as opções `5x1`, `4x1` e `3x1`; ao escolher, o menu fecha e a preferência continua salva por usuário/empresa (padrão `5x1`).

## 2. Distribuição equilibrada dos ícones (Início e tela "Mais")

Quando a última linha ficaria incompleta, os ícones são redistribuídos em quantidades parecidas entre as linhas e cada linha fica centralizada.

Exemplo com 5 por linha e 8 menus: em vez de 5 + 3, fica 4 + 4 centralizados. Com 7 menus: 4 + 3.

A mesma redistribuição é aplicada aos ícones da tela "Mais" (que hoje usa 3 por linha): cada grupo distribui os itens em linhas equilibradas e centralizadas, evitando a última linha com poucos itens desalinhados.

## 3. Texto dos favoritos

A frase do card de Atalhos Favoritos deixa de citar "DP" e passa a ser genérica: "Clique na estrela no topo de qualquer página do módulo para adicioná-la aqui como atalho."

## 4. Gesto de arrastar entre os menus do Início

Na tela de Início, no celular, arrastar o dedo na área de conteúdo (sem começar na borda da tela) passa para o próximo ou anterior dos menus principais — Cadastro, Documentos, Rotina, Comunicação e Geral — na mesma ordem dos ícones, exatamente como o gesto que já troca abas nas outras telas.

Os gestos que já existem continuam iguais: arrastar a partir da borda esquerda abre o Hub/Analytics, a partir da borda direita abre "Mais", e arrastar para baixo no topo atualiza a tela.

## Detalhes técnicos

- `MenusPrincipaisCards.tsx`: troca o grupo de 3 botões por um `DropdownMenu` com rótulos `5x1/4x1/3x1`; mantém `prefs.extras.home_atalhos_cols`.
- Nova função pura de distribuição (`src/lib/dp/menuGridRows.ts`) que recebe total de itens e colunas e devolve as linhas balanceadas; usada no Início e em `MoreGroupSection.tsx` (tela Mais). Teste unitário para os casos 8/5, 7/5, 5/5, 8/3.
- No Início, render passa de um grid único para linhas `flex justify-center`, com largura de item derivada das colunas; na tela Mais, o `flex-wrap` passa a usar as linhas calculadas (mesma largura atual de 1/3).
- `AtalhosFavoritos.tsx`: ajuste de texto.
- Reuso do helper de gesto existente (`src/lib/nav/tabSwipe.ts`) em `DpHome.tsx`, ligado à lista de grupos visíveis do menu, respeitando as bordas reservadas para os gestos de Hub e "Mais" e ignorando gestos sobre rolagem horizontal ou diálogos abertos.
- Sem alterações de banco de dados.
