# Aceite com atraso e convidar mais gente nos mesmos dias

Duas mudanças pedidas:

1. O colaborador pode aceitar um dia que já começou, justificando o atraso.
2. Ao tentar montar outra convocação para os mesmos dias, o sistema oferece incluir a pessoa na convocação que já existe.

## 1. Aceitar depois do horário ter começado

Hoje, quando o horário do dia começa, o dia é encerrado automaticamente e nem aparece botão de resposta. Passa a funcionar assim:

- Enquanto o horário daquele dia **ainda não terminou** e ainda há vaga, o dia continua respondível, com aviso claro: "Este horário começou às 16:30. Você ainda pode responder."
- Duas opções de aceite nesse caso:
  - **"Vim no horário, só não respondi"** — aceite integral retroativo: vale o horário completo pedido, sem virar horário parcial.
  - **"Vou chegar mais tarde"** — informa a hora de chegada; vira horário parcial, o dia fica reservado e vai para a sua aprovação, como já acontece hoje.
- Nos dois casos a justificativa curta é obrigatória.
- Se o horário já terminou, ou as vagas foram preenchidas por outra pessoa, o dia continua encerrado como hoje.
- Na tela do gestor, a resposta atrasada aparece marcada ("Respondeu 42 min depois do início · horário completo" ou "· chega 17:15"), com a justificativa, na aprovação de horário parcial e no histórico do dia.
- Fica registrado no histórico da convocação (quem aceitou, quantos minutos depois, qual das duas opções, justificativa).


## 2. Mesmos dias liberados; a pessoa é que não pode dobrar

- Você pode acrescentar vagas e cargos numa convocação existente **e** criar outra convocação para os mesmos dias — inclusive na mesma unidade, mesmo cargo e mesmo horário. O bloqueio atual de dia repetido sai.
- O limite passa a ser por pessoa: quem já aceitou (ou já tem horário parcial reservado) um horário que se sobrepõe deixa de estar disponível para a nova convocação naquele horário, em qualquer unidade.
- Na hora de escolher os convidados, essa pessoa aparece indisponível com o motivo: "Já confirmada em outra convocação das 16:30 às 00:20". Não é possível marcá-la.
- Se ela recusar, desistir ou o dia for cancelado, volta a ficar disponível automaticamente.
- No portal, um dia que se sobrepõe a outro já aceito aparece com aviso e sem botão de aceitar; a resposta é recusada pelo servidor se tentar por outro caminho.


## Detalhes técnicos

- Banco: novas colunas em `dp_convocacoes` (`aceite_atrasado boolean`, `aceite_atraso_minutos int`, `aceite_atraso_justificativa text`, `aceite_atraso_forma text` com `'integral'`/`'chegada_tardia'`).
- `public.dp_convocacao_responder_oferta`: deixa de encerrar por `OCCURRENCE_ALREADY_STARTED` quando `now()` está entre o início e o fim previsto da necessidade e há vaga; nesse caso exige justificativa, grava as novas colunas e registra evento `oferta_aceita_com_atraso` via `dp_convocacao_log_evento_trabalhador`. Forma `integral` mantém `resposta_tipo = 'integral'` e `status = 'aceita'` com a janela cheia; forma `chegada_tardia` segue o caminho parcial já existente (`parcial_status = 'aguardando_gestor'`). Encerramento por prazo (`sem_resposta`) e por fim do horário seguem como hoje.

- `dp_convocacao_minhas_ofertas` retorna `janela_terminou` e `minutos_de_atraso` para a tela do portal.
- Frontend: `DpMinhasConvocacoes.tsx` e `PropostaParcialDialog.tsx` ganham o estado "começou, mas ainda dá" com campo de justificativa; `src/lib/dp/convocacoes.ts` / `convocacoes-parcial.ts` ganham funções puras (`janelaEmAndamento`, `minutosDeAtraso`) com testes em `src/lib/dp/__tests__`.
- Gestor: `AprovacaoParcialDialog.tsx` e `DiaDetalheSheet.tsx` exibem o selo de atraso e a justificativa.
- Dias repetidos: remover o índice único `uq_dp_conv_ocor_necessidade_vigente` (unidade+data+cargo+janela) e o tratamento de erro `23505` correspondente em `NovaConvocacaoPlanner.tsx`.
- Sobreposição por pessoa: função `public.dp_colaborador_horario_ocupado(_colaborador_id, _data, _entrada, _saida, _vira_dia)` (SECURITY DEFINER, `search_path = public`) comparando janelas absolutas de `dp_convocacoes` com `status = 'aceita'` ou `parcial_status = 'aguardando_gestor'` em todas as unidades da empresa, ignorando a própria oferta. Usada em: validação de destinatários na gravação/publicação do grupo, `dp_convocacao_responder_oferta` (recusa com motivo `WORKER_ALREADY_BOOKED`) e na listagem de disponibilidade do planner (`DisponibilidadePainel.tsx`), com texto amigável em `convocacoes-motivos.ts`.
- Testes: casos puros de sobreposição (com virada de dia) em `src/lib/dp/__tests__/convocacoes.test.ts`.

