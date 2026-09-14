# Aceite com atraso e convidar mais gente nos mesmos dias

Duas mudanças pedidas:

1. O colaborador pode aceitar um dia que já começou, justificando o atraso.
2. Ao tentar montar outra convocação para os mesmos dias, o sistema oferece incluir a pessoa na convocação que já existe.

## 1. Aceitar depois do horário ter começado

Hoje, quando o horário do dia começa, o dia é encerrado automaticamente e nem aparece botão de resposta. Passa a funcionar assim:

- Enquanto o horário daquele dia **ainda não terminou** e ainda há vaga, o dia continua respondível, com aviso claro: "Este horário começou às 16:30. Se ainda consegue vir, aceite e explique o atraso."
- Ao aceitar, o colaborador escreve uma justificativa curta (obrigatória nesse caso) e informa a hora em que consegue chegar. Quando a chegada é depois do início pedido, isso é tratado como horário parcial: o dia fica reservado e vai para a sua aprovação, igual já acontece hoje com o horário parcial.
- Se o horário já terminou, ou as vagas foram preenchidas por outra pessoa, o dia continua encerrado como hoje.
- Na tela do gestor, o aceite com atraso aparece marcado ("Aceite com atraso · 42 min"), com a justificativa, na aprovação de horário parcial e no histórico do dia.
- Fica registrado no histórico da convocação (quem aceitou, quantos minutos depois, justificativa).

## 2. Mesmos dias liberados; a pessoa é que não pode dobrar

- Você pode acrescentar vagas e cargos numa convocação existente **e** criar outra convocação para os mesmos dias — inclusive na mesma unidade, mesmo cargo e mesmo horário. O bloqueio atual de dia repetido sai.
- O limite passa a ser por pessoa: quem já aceitou (ou já tem horário parcial reservado) um horário que se sobrepõe deixa de estar disponível para a nova convocação naquele horário, em qualquer unidade.
- Na hora de escolher os convidados, essa pessoa aparece indisponível com o motivo: "Já confirmada em outra convocação das 16:30 às 00:20". Não é possível marcá-la.
- Se ela recusar, desistir ou o dia for cancelado, volta a ficar disponível automaticamente.
- No portal, um dia que se sobrepõe a outro já aceito aparece com aviso e sem botão de aceitar; a resposta é recusada pelo servidor se tentar por outro caminho.


## Detalhes técnicos

- Banco: novas colunas em `dp_convocacoes` (`aceite_atrasado boolean`, `aceite_atraso_minutos int`, `aceite_atraso_justificativa text`).
- `public.dp_convocacao_responder_oferta`: deixa de encerrar por `OCCURRENCE_ALREADY_STARTED` quando `now()` está entre o início e o fim previsto da necessidade e há vaga; nesse caso exige justificativa, grava as novas colunas, força `resposta_tipo = 'parcial'` quando a chegada é posterior ao início e registra evento `oferta_aceita_com_atraso` via `dp_convocacao_log_evento_trabalhador`. Encerramento por prazo (`sem_resposta`) e por fim do horário seguem como hoje.
- `dp_convocacao_minhas_ofertas` retorna `janela_terminou` e `minutos_de_atraso` para a tela do portal.
- Frontend: `DpMinhasConvocacoes.tsx` e `PropostaParcialDialog.tsx` ganham o estado "começou, mas ainda dá" com campo de justificativa; `src/lib/dp/convocacoes.ts` / `convocacoes-parcial.ts` ganham funções puras (`janelaEmAndamento`, `minutosDeAtraso`) com testes em `src/lib/dp/__tests__`.
- Gestor: `AprovacaoParcialDialog.tsx` e `DiaDetalheSheet.tsx` exibem o selo de atraso e a justificativa.
- Conflito de dias: `NovaConvocacaoPlanner.tsx` (`tratarErroDeGravacao`) passa a consultar a ocorrência vigente pelo mesmo `company_id/unidade/data/cargo/janela` e oferece a ação "Abrir e incluir", reaproveitando `onAbrirRascunho` e a gravação de destinatários.
