# Convocação de intermitente no celular: erro ao salvar, horário em branco e aviso preso na tela

## O que eu confirmei

1. **O erro ao salvar é real e está registrado.** Hoje às 19:24 (horário de SP), na convocação da Pakerê, o sistema recusou o dia 19/09 com uma mensagem técnica de banco ("duplicate key ... uq_dp_conv_ocor_necessidade_vigente"). Motivo: existe um **rascunho antigo de convocação, de 06 e 07/09, ainda aberto**, com os mesmos dias (19, 20, 26 e 27/09), mesma unidade, mesmo cargo e o mesmo horário 16:30–00:20. O sistema impede duas necessidades iguais ao mesmo tempo, mas hoje isso aparece como erro técnico incompreensível, sem dizer que já existe outro rascunho com aquele dia.
2. **A mensagem chegou como falha não tratada.** O aviso saiu pelo canal de "erro inesperado", por isso o texto técnico apareceu na tela em vez de uma explicação.
3. **Horário da colaboradora:** a ALESSANDRA (intermitente) tem horário habitual cadastrado **só para domingo, sexta e sábado** (16:30–00:20). De segunda a quinta os dias estão marcados como "trabalha", mas **sem horário**. Nesses dias o sistema não tem o que preencher e a janela fica vazia.
4. **Como o horário é sugerido hoje:** ao marcar o dia, a sugestão vem do histórico de convocações e da prática da equipe fixa **do cargo**, nunca da pessoa escolhida. Ou seja, escolher a colaboradora não traz o horário dela.

Ainda **não confirmei** por que o botão "Relatar problema" ficou preso: a suspeita é que o aviso aparece por cima enquanto a janela da convocação está aberta e, ao clicar, o formulário de chamado abre atrás dessa janela — vou reproduzir no tamanho de celular antes de corrigir.

## O que será feito

**1. Erro ao salvar em linguagem clara e com caminho de saída**
- Quando o dia já existir em outro rascunho, mostrar: "O dia 19/09 já está em outro rascunho de convocação desta unidade e cargo, com o mesmo horário. Abra esse rascunho para continuar ou mude o horário."
- Oferecer o atalho para abrir o rascunho conflitante.
- Nenhum texto técnico de banco aparece mais para o usuário; a falha continua registrada na auditoria de erros com todos os detalhes.

**2. Horário da pessoa escolhida**
- Ao selecionar a colaboradora, usar o horário habitual dela naquele dia da semana como sugestão, quando existir.
- Quando ela não tiver horário no dia (caso de segunda a quinta da Alessandra), avisar com clareza: "Sem horário habitual nesta data — informe a janela ou complete o horário no cadastro dela", com atalho para o cadastro.
- Ordem de preferência: horário geral definido na tela → horário habitual da pessoa no dia → histórico/prática do cargo → manual.

**3. Aviso de problema não atrapalha mais a navegação**
- O convite para relatar não fica sobre a barra de navegação nem sobre botões; sai da tela ao ser fechado e não reaparece sozinho.
- Clicar em "Relatar problema" abre o formulário sempre visível, inclusive com outra janela aberta.
- Se o formulário não puder abrir, o aviso é fechado em vez de ficar preso.

**4. Limpeza do rascunho antigo**
- Na lista de convocações, destacar rascunhos antigos com dias já passados e permitir descartá-los, para não bloquearem novos planejamentos.

## Detalhes técnicos

- `src/hooks/useDpConvocacaoGrupos.tsx` / `NovaConvocacaoPlanner.tsx`: tratar `23505` de `uq_dp_conv_ocor_necessidade_vigente`, identificar a ocorrência/grupo em conflito por company+unidade+data+cargo+janela e traduzir a mensagem; nada de `throw` cru para o canal global.
- `persistir()` e `toggleDia()`: envolver as chamadas em tratamento próprio para não gerar `unhandledrejection`.
- Sugestão de horário: em `resolverSugestao`/`toggleDia`, considerar `preview.jornadaDe(colaboradorId, data)` dos destinatários selecionados antes da RPC `dp_convocacao_necessidade_sugerida`; sem base, manter manual com aviso.
- `src/components/errors/ErrorReportCenter.tsx`: toast com `dismissible`, `id` estável e `toast.dismiss` na ação; garantir `z-index` acima de outros diálogos (portal próprio) e fallback fechando o aviso quando `pending` estiver vazio; revisar o botão em `src/components/ErrorBoundary.tsx` para abrir o formulário direto, sem depender do evento.
- Validação com Playwright em viewport de celular (`/dp/convocacoes`): repetir dia conflitante, conferir mensagem clara, sugestão de horário e o aviso de relato abrindo o formulário e saindo da tela.
