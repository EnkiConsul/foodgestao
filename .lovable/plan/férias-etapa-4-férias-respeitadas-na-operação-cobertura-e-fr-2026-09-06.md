# Férias etapa 4: férias respeitadas na operação, cobertura e fracionamento

Sim: falta a última etapa das férias. Hoje, quem está de férias ainda pode receber folga, convocação e escala — nada no sistema impede isso — e não existe controle de fracionamento (dividir as férias em períodos) nem uma visão de calendário das férias.

## O que vou entregar

1. **Ninguém trabalha durante as férias**
   - Marcar folga, convocar ou escalar alguém que está de férias passa a ser recusado, com aviso claro: "Fulano está de férias de 10/01 a 29/01".
   - Na rotina do dia e no calendário do mês, a pessoa aparece com a marca de férias e sai da lista de disponíveis.
   - Se as férias forem aprovadas depois de a pessoa já ter folga ou convocação naquele intervalo, o sistema avisa quais registros conflitam antes de confirmar.

2. **Sugestão de cobertura**
   - Ao aprovar as férias, um aviso mostra os dias do período em que a equipe fica abaixo do mínimo por turno/cargo.
   - Botão "Convocar cobertura" abre a Nova Convocação já preenchida com unidade, cargo, dias descobertos e horário do turno.

3. **Fracionamento controlado**
   - Nova regra por empresa: permitir dividir as férias em até 3 períodos, com um de no mínimo 14 dias e os outros de no mínimo 5 dias (padrão legal, ajustável).
   - Ao programar ou pedir férias, o sistema mostra quantos dias restam do período e recusa divisões fora da regra, explicando o motivo.

4. **Calendário de férias**
   - Nova aba com a visão do ano por pessoa: barras por mês mostrando programadas, em gozo e concluídas, filtro por unidade e destaque de quem está com prazo perto de vencer.

## Detalhes técnicos

- Migração nova:
  - função `dp_ferias_em_curso(_colaborador_id, _data)` e `dp_ferias_periodo_conflitos(_colaborador_id, _inicio, _fim)` (STABLE, SECURITY DEFINER, GRANT `authenticated`/`service_role`).
  - triggers fail-closed em `dp_folgas`, `dp_convocacao_destinatarios` (ou `dp_convocacoes`) e `dp_escala_itens` levantando `FERIAS_COLABORADOR_EM_FERIAS`; itens de escala do tipo `ferias` seguem permitidos.
  - `dp_convocacao_avaliar_candidato` passa a marcar o candidato como inapto com motivo `EM_FERIAS`.
  - `dp_config_dp`: `ferias_fracionamento_max` (1–3), `ferias_fracao_min_dias`, `ferias_fracao_maior_dias`; `dp_ferias_config` devolve os três com override por unidade.
  - `dp_ferias_validar_programacao` valida o fracionamento contra os gozos não cancelados do mesmo período (`FERIAS_FRACIONAMENTO_LIMITE`, `FERIAS_FRACAO_CURTA`, `FERIAS_FRACAO_MAIOR_AUSENTE`).
  - `dp_ferias_cobertura_sugestao(_gozo_id)` cruzando `dp_cobertura_minima` com a escala prevista do período.
- Frontend:
  - `src/lib/dp/ferias-fracionamento.ts` + testes puros das regras de divisão.
  - `ferias-direito.ts`: textos dos novos erros.
  - `useDpFeriasConfig`/`FeriasConfigCard`: campos de fracionamento.
  - `FeriasGozoDialog`: resumo de saldo/frações e bloqueio antes de enviar.
  - `FeriasCoberturaDialog` + link para `Nova Convocação` com parâmetros na URL.
  - `FeriasCalendarioPanel` e nova aba em `DpFeriasHub`.
  - Motivo "de férias" nos motivos de inaptidão da convocação e nos painéis de folga/operação.
- Verificação: `bunx tsgo --noEmit`, `bunx vitest run src/lib/dp`, teste SQL novo cobrindo bloqueio de folga/convocação em férias e limites de fracionamento.
