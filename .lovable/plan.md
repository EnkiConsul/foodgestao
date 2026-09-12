# Gestos no celular: navegar entre menus arrastando para cima/baixo

## O que muda para você

1. **Arrastar para os lados no Início deixa de abrir o menu Cadastro.** Só continuam os gestos de borda já conhecidos: da borda esquerda para a direita abre o Hub (ou o Analytics, quando a empresa tem só um módulo) e da borda direita para a esquerda abre a tela "Mais".

2. **Arrastar de baixo para cima passa para o próximo menu.** No Início, o primeiro arrasto abre o primeiro menu (hoje Cadastro). Estando em Cadastro, o próximo arrasto para cima abre Documentos, depois Rotina, Comunicação e Geral, na mesma ordem dos ícones. No último menu o gesto para (sem voltar ao começo).

3. **Arrastar de cima para baixo volta para o menu anterior.** De Rotina volta para Documentos, de Documentos para Cadastro, e de Cadastro volta para o Início.

4. **Atualizar arrastando para baixo continua só onde faz sentido:** na tela de Início e nas telas de uso (colaboradores, férias, ponto, lançamentos etc.). Nas telas de menu (Cadastro, Documentos, Rotina, Comunicação, Geral) o arrasto para baixo passa a servir para voltar ao menu anterior, não para atualizar.

O gesto lateral que troca de aba nas telas com abas continua igual, assim como a rolagem normal das listas.

## Detalhes técnicos

- `src/components/dp/home/useHomeSwipeMenus.ts` deixa de tratar swipe horizontal e passa a um gesto vertical, reaproveitável: novo `src/components/dp/nav/useMenuSwipeVertical.ts` (ou renomear o arquivo atual), com lógica pura extraída em `src/lib/nav/menuSwipe.ts` (`proximoMenuDestino(rotas, pathnameAtual, direcao)`), testável por unidade.
- Lista de menus derivada de `DP_ADMIN_NAV` + `applyMenuLayout` + `filterSurface` (mesma fonte dos ícones do Início), usando `hubTo` de cada grupo.
- Regras do gesto: apenas mobile; deslocamento vertical mínimo ~70px, predominantemente vertical (|dy| > |dx|), até 500ms; ignora quando há diálogo aberto, quando o toque começa em scroller vertical que ainda pode rolar (ou seja, só arma no topo/fim da rolagem) e nas faixas de 28px das bordas reservadas aos gestos de Hub/Mais.
- Ativação: o hook é montado no Início (`DpHome.tsx`) e nas telas de hub de menu (`DpCadastrosHub`, `DpDocumentosHub`, `DpRotinaHub`, `DpComunicacaoHub`, `DpGeralHub`) — provavelmente via um wrapper comum em `DpGroupCards`/`DpPage` para não repetir.
- Pull-to-refresh: o `PullToRefresh` que hoje envolve o `Outlet` em `DpShell.tsx` passa a ser desativado nas rotas de hub de menu (lista de rotas em `src/lib/nav/pullToRefreshRoutes.ts`), evitando conflito com o novo gesto de "voltar ao menu anterior". Mantido no Início e nas telas de uso.
- Testes: unitários da função de próximo/anterior menu (pontas, Início como origem, retorno ao Início) e validação por Playwright em viewport mobile simulando arrastos verticais no Início e em Cadastro.
- Sem alterações no banco de dados.
