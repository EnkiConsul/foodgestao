# Plano: Simplificar rótulos dos atalhos de horário

## Objetivo
Nos atalhos de horário do painel de cadastro do colaborador, mostrar apenas o primeiro nome do colega, sem a faixa de horário, para que caibam mais sugestões na linha e a escolha fique mais rápida.

## Alterações
1. **Atalhos inline** em `src/components/dp/ColaboradorJornadaPanel.tsx` (linha ~664):
   - Remover `· {formatarFaixaTurno(m.horario!)}` do rótulo dos botões de atalho.
   - Manter a dica visual (tooltip) ou o `title` nativo com a faixa de horário, para que o usuário ainda possa conferir ao passar o mouse.
2. **Lista do diálogo "Copiar de outro colaborador"** em `src/components/dp/CopiarConfigColaboradorDialog.tsx`:
   - Preservar o resumo do horário no sublinha; essa tela é expandida, então não precisa de compactação.
3. **Ajuste de layout** (se necessário):
   - Aumentar o número de atalhos exibidos de 6 para um valor que aproveite melhor o espaço liberado (ex.: 8–10), mantendo a deduplicação por faixa de horário.

## Validação
- Verificar visualmente no preview que os atalhos mostram apenas nomes e que o hover ainda revela o horário.
- Confirmar que o clique continua aplicando o horário correto.

## Arquivos envolvidos
- `src/components/dp/ColaboradorJornadaPanel.tsx`
- `src/components/dp/CopiarConfigColaboradorDialog.tsx` (apenas revisão, sem mudança obrigatória)
