# Horário base do colaborador ao mudar a folga + horário base da loja por frequência

## O que está acontecendo hoje

1. Ao desmarcar um dia de folga e marcar outro, o dia recém-marcado volta com o horário da loja.
   Confirmei no código: quando um dia é ligado/desligado, o sistema limpa entrada, saída e intervalo,
   mas mantém o vínculo com o horário da loja que aquele dia tinha antes. Como o cálculo do dia lê
   primeiro esse vínculo e só depois o horário base do colaborador, o dia herda a faixa da loja.

2. O "horário da loja" usado como referência é escolhido pelo cadastro (primeiro/mais recente), não
   pelo mais repetido: a lista de horários vem ordenada por hora de entrada e a sugestão automática
   agrupa a semana inteira, então dois colegas com o mesmo horário base mas escalas diárias
   diferentes contam como modelos distintos — o desempate acaba caindo no mais recente. Além disso,
   quando o colaborador novo ainda não tem cargo definido, o painel abre com 08:00–17:00 fixo em vez
   do horário mais usado na unidade.

## O que será feito

### 1. Marcar/desmarcar dia volta para o horário base do colaborador
- Ao alternar um dia (e nos atalhos 6x1 / 5x2), limpar também o vínculo com o horário da loja, não
  só a faixa própria do dia. O dia passa a herdar o horário base do colaborador.
- O dia continua exibindo o badge "Usa o horário base", e quem quiser um horário diferente digita
  no próprio dia (isso segue virando horário da loja apenas no momento de salvar).

### 2. Horário base da loja = o que mais se repete entre os colaboradores
- Nova função de domínio que calcula o horário base mais frequente entre os colaboradores ativos,
  contando por colaborador: primeiro dentro do cargo, depois da unidade e por fim da empresa;
  empate resolvido pelo uso mais recente.
- Usos:
  - Painel de horário de um colaborador novo abre pré-preenchido com esse horário (substitui o
    08:00–17:00 fixo) mesmo quando o cargo ainda não foi escolhido.
  - Sugestão automática de jornada passa a escolher o horário base pela frequência do horário base
    (e não pela assinatura da semana inteira), mantendo a semana do colega mais representativo.
  - Atalhos/chips de horário da loja passam a ser ordenados por quantidade de colaboradores que
    usam cada faixa, em vez da ordem de cadastro.

### 3. Testes
- Testes unitários: alternar dia limpa o vínculo de turno e o dia volta ao horário base; horário
  mais frequente vence o mais antigo/mais recente, com precedência cargo → unidade → empresa.

## Detalhes técnicos
- `src/components/dp/ColaboradorJornadaPanel.tsx`: `alternarDia` e `aplicarEscala` passam a zerar
  `turno_id` junto com `entrada`/`saida`/`intervalo_minutos`; horário inicial do painel passa a vir
  do novo cálculo de frequência em vez de `HORARIO_PADRAO`.
- Novo helper em `src/lib/dp/modeloHorarioRanking.ts` (ex.: `horarioBaseMaisComum`) somando
  ocorrências de `ModeloHorarioColaborador.horario`, com escopos cargo/unidade/empresa.
- Ordenação dos atalhos de horário da loja usa a contagem por colaborador vinda de
  `useDpModelosHorario` (não altera `dp_turnos`).
- Sem mudanças de banco de dados nem de RLS.
