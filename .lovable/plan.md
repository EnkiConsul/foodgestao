# Corrigir a rolagem da nova convocação

## Objetivo
Permitir rolar toda a janela de “Nova convocação” até o fim do calendário e das datas selecionadas, mantendo o cabeçalho e os botões finais acessíveis.

## Alterações
- Dar à janela uma altura efetiva limitada à tela, em vez de depender apenas de altura máxima.
- Trocar a área interna atual por uma rolagem vertical nativa e isolada, com altura flexível correta; isso evita que o calendário aumente a janela e fique escondido pelo rodapé.
- Manter cabeçalho e rodapé fixos dentro da janela, rolando somente o conteúdo central.
- Preservar a etapa de revisão e o restante do fluxo sem mudanças funcionais.

## Validação
- Abrir “Nova convocação” e confirmar com mouse, touchpad e arraste que é possível alcançar todos os dias do calendário, as datas selecionadas e a observação.
- Conferir também a etapa “Revisar e publicar”.
- Validar em tela desktop e celular, além dos testes e verificações de código da área de convocações.

## Detalhes técnicos
A janela hoje combina `max-height`, `overflow-hidden` e uma área de rolagem flexível sem altura efetiva definida. A correção estabelecerá a altura disponível da janela e usará `min-height: 0` com `overflow-y: auto` no conteúdo central, sem alterar as regras de convocação ou o banco de dados.
