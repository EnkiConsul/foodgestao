# Aceite parcial de convocações

Hoje o colaborador só pode aceitar ou recusar cada dia inteiro. Vamos permitir aceitar alguns dias e, em um dia específico, oferecer um horário mais curto — que passa pela aprovação do gestor, com proteção para a empresa não ficar sem ninguém.

## Como vai funcionar

**Para o colaborador (Minhas convocações)**
- Cada dia continua respondido separadamente: aceitar, recusar ou "Posso vir parte do horário".
- Ao escolher o horário parcial, ele ajusta entrada e/ou saída apenas dentro da janela pedida (não pode alargar o horário) e escreve um recado opcional.
- O dia fica com o selo "Aguardando aprovação do gestor". Enquanto isso, o dia está reservado para ele — ninguém confirma no lugar dele sem o gestor decidir.

**Para o gestor (Convocações)**
- Nova aba "Aprovações" com os dias em horário parcial: quem propôs, horário pedido x horário oferecido, quanto tempo fica descoberto e desde quando aguarda.
- **Aprovar**: o dia é confirmado com o horário reduzido; o sistema avisa na tela o trecho que continua descoberto, para o gestor decidir se convoca mais alguém (não abre oferta automática).
- **Recusar**: antes de concluir, o sistema verifica quem mais está apto naquele dia.
  - Se não houver ninguém apto: aviso claro "Não há outra pessoa apta para este dia" e confirmação explícita de que quer recusar mesmo assim.
  - Se houver aptos: opção "Oferecer o dia aos aptos antes de recusar" — envia o dia inteiro para todos os aptos ao mesmo tempo, com prazo; quem aceitar primeiro fica com o dia.
- Enquanto o dia está reofertado, a proposta parcial fica reservada. Se alguém aceitar o horário inteiro, a parcial é automaticamente recusada com o motivo "vaga coberta por outra pessoa". Se ninguém aceitar até o prazo, o gestor volta a decidir e pode aprovar a parcial — evitando ficar sem mão de obra.
- Tudo fica registrado no histórico do dia (proposta, aprovação/recusa, reoferta, quem aceitou).

## Regras mantidas
- Um dia que já começou não aceita mais resposta nem reoferta.
- Continua valendo o limite de vagas por dia e a checagem de aptidão (jornada, descanso, bloqueios, outra convocação no mesmo dia).
- A escala e o horário previsto passam a usar o horário parcial aprovado, sem alterar o restante do dia.

## Detalhes técnicos

Banco (uma migração):
- `dp_convocacoes`: `resposta_tipo text` (`integral` | `parcial`), `parcial_entrada`/`parcial_saida time`, `parcial_termina_no_dia_seguinte boolean`, `parcial_carga_horas numeric`, `parcial_observacao text`, `parcial_status text` (`aguardando_gestor` | `aprovada` | `recusada` | `superada`), `parcial_decidido_em/por`, `parcial_decisao_motivo`, `reoferta_de_convocacao_id uuid`. Check constraints garantindo parcial contida na necessidade e coerência dos campos.
- Novo valor no enum `dp_convocacao_status`: `parcial_aguardando` (reservado, não conta como vaga preenchida, mas bloqueia a unicidade do dia junto com `pendente`/`aceita`).
- `dp_convocacao_responder_oferta`: novo parâmetro opcional de proposta parcial; valida janela, recalcula carga com `dp_convocacao_horario_efetivo`, grava status `parcial_aguardando` e evento `oferta_parcial_proposta`.
- Novas funções: `dp_convocacao_avaliar_parcial(p_convocacao_id)` (retorna cobertura, trecho descoberto e lista de aptos usando `dp_convocacao_avaliar_candidato` sobre os elegíveis da ocorrência); `dp_convocacao_decidir_parcial(p_convocacao_id, p_acao 'APROVAR'|'RECUSAR'|'REOFERTAR', p_motivo, p_prazo)` — aprovar move para `aceita` com horário parcial e sincroniza escala via `dp_convocacao_sync_escala`; reofertar cria ofertas `pendente` para os aptos com `reoferta_de_convocacao_id`; recusar exige motivo e confirmação quando não há aptos.
- `dp_convocacao_responder_oferta` (aceite integral): ao preencher a última vaga, marca as parciais reservadas como `parcial_status = 'superada'` e status `recusada` com motivo `COVERED_BY_OTHER`.
- `dp_convocacao_minhas_ofertas` retorna os campos da parcial; grants e políticas seguem o padrão das tabelas de convocação.

Frontend:
- `src/lib/dp/convocacoes.ts`: status/labels da parcial, helper de validação da janela e cálculo do trecho descoberto (com testes em `src/lib/dp`).
- `src/pages/dp/portal/DpMinhasConvocacoes.tsx` + novo `PropostaParcialDialog.tsx`: botão e diálogo de horário parcial, selo de aguardando.
- `src/hooks/useDpConvocacoes.tsx`: mutação de proposta parcial; novo `useDpConvocacoesParciais` (lista, avaliação e decisão).
- `src/pages/dp/DpConvocacoes.tsx`: aba "Aprovações"; novo `components/dp/convocacoes/AprovacaoParcialDialog.tsx` com os três caminhos (aprovar / reofertar aos aptos / recusar com confirmação quando não há aptos).
- Verificação: `bunx tsgo --noEmit -p tsconfig.app.json` e `bunx vitest run src/lib/dp`.
