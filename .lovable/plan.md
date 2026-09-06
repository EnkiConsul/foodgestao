# Convocação de 12/09 — por que a Alessandra ficou "não apta"

## O que está acontecendo

Os horários realmente batem — o problema é que a tela e o rascunho salvo estão com valores diferentes.

O que está gravado no rascunho hoje:

- 12/09: necessidade das 16:30 às 00:35 do dia seguinte
- 13/09: necessidade das 16:30 às 00:20 do dia seguinte

O horário habitual da Alessandra termina 00:20. Então em 13/09 ela cobre a necessidade inteira (aparece "Apta") e em 12/09 faltam 15 minutos, por isso ela é recusada.

A tela mostra "Janela da necessidade: 16:30–00:20" nos dois dias porque o botão "Ajustar a necessidade" (ou "Usar o horário informado para todos") alterou o valor na tela, mas o salvamento aconteceu antes da alteração entrar em vigor — ou seja, o rascunho continuou com 00:35. Resultado: a mensagem fica contraditória, dizendo que 16:30–00:20 não cobre 16:30–00:20.

## Correção

1. Fazer os botões de correção da revisão salvarem exatamente o valor novo, e não o valor anterior da tela: passar o ajuste diretamente para a gravação em vez de depender do estado que acabou de mudar. Vale para os dois botões ("Usar o horário informado para todos" e "Ajustar a necessidade para ...").
2. Depois de salvar, recarregar a verificação prévia (já acontece) para que o aviso desapareça de imediato quando o ajuste resolver.
3. Enquanto a verificação prévia estiver desatualizada em relação à tela, mostrar o horário que o banco avaliou na mensagem, para nunca aparecer uma frase contraditória: "O horário habitual dela (16:30–00:20) não cobre o horário pedido (16:30–00:35)".
4. Ajuste imediato do seu caso: com a correção, clicar em "Ajustar a necessidade para 16:30–00:20" no dia 12/09 deixa a Alessandra apta.

## Detalhes técnicos

- `src/components/dp/convocacoes/NovaConvocacaoPlanner.tsx`: `onAjustarNecessidade` e `onUsarHorarioParaTodos` chamam `persistir()` logo após `patchDia` / `setHorarioGeral`, então `persistir` grava o estado antigo (closure desatualizada). Passar um override explícito (ex.: `persistir({ diasOverride, horarioGeralOverride, usaHorarioGeral })`) usado na montagem de `diasCompletos` e do payload de `dp_convocacao_atualizar_ocorrencia`.
- `src/components/dp/convocacoes/RevisaoConvocacao.tsx`: usar `av.necessidade_entrada`/`av.necessidade_saida`/`av.necessidade_termina_no_dia_seguinte` da linha de pré-avaliação no texto do motivo (`textoDoMotivo`), em vez de `o.dia.entrada`/`o.dia.saida` do estado local; o mesmo valor alimenta o rótulo do botão "Ajustar a necessidade".
- Sem mudança de banco: `dp_convocacao_avaliar_candidato` está correta (trata virada de dia nas duas janelas).
- Teste: em `src/lib/dp` (ou teste de componente), cobrir que ajustar a saída da necessidade na revisão envia o novo valor no payload de gravação.
