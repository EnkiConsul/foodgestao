# Rolar as pendências não deve trocar de menu

## O problema

Na tela de Início do Pessoas 360°, a lista de Pendências tem rolagem própria. Ao arrastar dentro dela, o gesto de troca de menu é disparado e a tela pula para Cadastro.

Isso acontece porque o gesto só é bloqueado enquanto ainda existe rolagem restante: quando a lista chega ao fim (ou quando a lista é curta e não rola), o arrasto é interpretado como "abrir o próximo menu".

## O que muda

- Arrastar dentro de uma área com rolagem própria (como o quadro de Pendências) nunca troca de menu, mesmo que a lista já esteja no fim ou seja curta demais para rolar.
- A troca de menu por gesto continua funcionando normalmente no restante da tela e nas bordas superior/inferior.
- Nenhuma mudança visual e nenhuma mudança nos dados das pendências.

## Detalhes técnicos

`src/components/dp/nav/useMenuSwipeVertical.ts`:

- `verticalScrollerDoToque`: reconhecer o contêiner pelo `overflow-y` (`auto`/`scroll`) independentemente de `scrollHeight`, para que uma lista curta com rolagem declarada também conte.
- No `tentarNavegar`: quando o toque começou dentro de um scroller interno (diferente do documento), abortar o gesto — sem depender de `scrollTop`. Manter a exceção de início nas bordas verticais (`comecouNaBordaVertical`).
- `rolagemBloqueiaGesto` passa a tratar apenas a rolagem do documento.
- Testes: casos novos em `src/lib/nav/__tests__/menuSwipe.test.ts` (ou arquivo de teste dedicado ao hook) cobrindo toque iniciado dentro de área com rolagem própria, no fim da lista e em lista curta; rodar `bunx vitest run` e a verificação de tipos.

Sem migration, sem alteração de banco e sem publicação.
