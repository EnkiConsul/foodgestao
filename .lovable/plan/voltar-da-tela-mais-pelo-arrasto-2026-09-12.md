# Voltar da tela "Mais" pelo arrasto

## O que está acontecendo

Testei no navegador simulado: ir do Início para "Mais" (arrasto da direita para a esquerda) e voltar (arrasto da borda esquerda para a direita) funcionam. Ou seja, a regra de voltar existe e está correta — o problema aparece só no celular real.

A causa mais provável é o próprio navegador do celular: o arrasto que começa nos primeiros 28 px da borda esquerda é o gesto nativo de "voltar" do sistema. O navegador captura o movimento antes do aplicativo, então a tela "Mais" nunca recebe o arrasto completo e nada acontece.

## O que vou mudar

1. **Voltar de "Mais" com arrasto em qualquer ponto da tela**: na tela "Mais", um arrasto da esquerda para a direita passa a valer começando de qualquer lugar do conteúdo, não só da borda. Isso tira a disputa com o gesto do sistema e ainda deixa o uso com uma mão mais fácil.
2. **Impedir que o navegador roube o gesto** quando ele começa na borda: assim que o arrasto é reconhecido como gesto do aplicativo, o movimento é bloqueado para o navegador.
3. **Rede de segurança**: se o "voltar" não mudar de tela em pouco tempo (histórico sem entrada anterior, entrada direta pelo link), o aplicativo abre a tela inicial do módulo.
4. **Sem efeitos colaterais**: o arrasto continua sendo ignorado quando começa dentro de listas que rolam na horizontal, dentro de telas com abas e quando há uma janela aberta.

## Detalhes técnicos

- `src/hooks/useEdgeGestures.ts`: quando `pathname === moreTo`, aceitar início do toque também na área central (mantendo os mesmos limites de 56 px de deslocamento, 70 px de tolerância vertical e 800 ms); `touchmove` passa a ser registrado como não passivo, com `preventDefault()` após armar o gesto; após `navigate(-1)`, verificar em ~400 ms se a rota mudou e, se não, `navigate(homeTo)`.
- Guardas atuais preservados: `startedInHorizontalScroller`, diálogos abertos (`[role="dialog"][data-state="open"]`), toque múltiplo e `useSidebar().isMobile`.
- Evitar conflito com `src/lib/nav/tabSwipe.ts`: a tela "Mais" não tem `tablist`, então o gesto de abas não é acionado; nenhuma mudança lá.
- Validação: `tsc --noEmit`, os testes de `src/lib/nav/__tests__/` e um roteiro Playwright em 407×748 cobrindo Início → Mais → Início (arrasto central e da borda) e a troca entre menus por arrasto vertical.
