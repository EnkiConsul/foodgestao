# Horário de trabalho: só dia por dia (horário padrão automático)

Hoje a tela tem dois lugares para o mesmo assunto: o bloco "Horário de Trabalho" no topo (entrada,
saída, intervalo) e, abaixo, o horário de cada dia da semana. O bloco de cima é o horário padrão que
preenche silenciosamente os dias não editados e é o que a escala, o ponto e a folha leem como turno
principal — daí a confusão, e também os avisos de "horário base diferente da semana".

Decisão: o bloco de cima sai da tela. O empresário cadastra apenas dia por dia e o sistema define o
horário padrão sozinho.

## O que muda na tela

- O bloco "Horário de Trabalho" (entrada/saída/intervalo geral) é removido.
- Cada dia trabalhado mostra sempre entrada, saída e intervalo já preenchidos e editáveis. Em
  colaborador novo, vêm preenchidos com o horário mais usado pelos colegas da unidade/cargo (regra
  já implementada); ao ligar um dia que estava em folga, ele copia o horário mais repetido na semana
  desse colaborador.
- Os atalhos "Copiar o horário de: [colega]", "Grade da unidade", "6x1" e "5x2" continuam, agora
  agrupados no cabeçalho de "Dias da Semana".
- Desaparecem os elementos que só existiam por causa do horário base: badge "Usa o horário base" e o
  aviso "Horário base diferente da semana / Usar X → Y como base".
- O total por dia e o total semanal (com o detalhamento no clique) continuam iguais, agora somando
  sempre o horário do próprio dia.
- Novo texto de apoio: "O horário de cada dia é o que vale para escala, ponto e folha. O sistema usa
  o horário mais repetido da semana como horário padrão do colaborador."

## O que muda por baixo (sem mudar banco)

- O horário padrão passa a ser calculado: horário mais repetido entre os dias trabalhados (empate
  resolvido pelo dia mais cedo na semana). Esse horário é que resolve/cria o turno gravado em
  `turno_padrao_id`, exatamente como hoje.
- Ao salvar: dias iguais ao horário padrão ficam sem horário próprio (herdam o turno padrão); dias
  diferentes continuam apontando para o horário da loja correspondente, criado/reaproveitado em
  silêncio. Nada muda para escala, ponto, folha e portal.
- Ao carregar um colaborador existente, os dias sem horário próprio são preenchidos na tela com o
  horário do turno padrão gravado — o usuário passa a ver o horário real de cada dia em vez de campo
  herdado.
- Alertas de CLT (menor de idade, intervalo, adicional noturno) e validações continuam rodando sobre
  o horário resolvido de cada dia.

## Detalhes técnicos

- `src/components/dp/ColaboradorJornadaPanel.tsx`: remove a seção do horário base e o estado editável
  `horario` vira derivado (`horarioPadraoDerivado`) via `useMemo`; `definirHorarioDia`, `alternarDia`,
  `aplicarEscala`, cópia de colega e grade da unidade passam a gravar horário explícito em cada dia;
  remove `alinharHorarioBase`/`baseDefasado` da UI.
- `src/lib/dp/config-trabalho.ts`: nova função pura `horarioPadraoDaSemana(dias)` (mais repetido) e
  `preencherDiasComHorario(dias, base)` para materializar os dias ao carregar/ligar um dia. Mantém
  `diaDivergeDoBase`, usada na hora de salvar.
- `persistir()` passa a usar `horarioPadraoDaSemana` como horário do turno padrão.
- Testes unitários novos em `src/test/unit/horarioPadraoSemana.test.ts`: horário mais repetido vence,
  ligar dia herda o mais repetido, e o salvamento marca como próprio apenas os dias divergentes.
- Sem migração de banco: o formato gravado (`turno_padrao_id` + dias com/sem horário) é o mesmo.
