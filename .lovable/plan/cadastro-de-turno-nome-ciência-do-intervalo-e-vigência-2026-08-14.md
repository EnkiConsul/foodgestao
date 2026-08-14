# Cadastro de turno: nome, ciência do intervalo e vigência

Três ajustes no formulário de turno (`/dp/cadastros/turnos` e o formulário embutido no cadastro do colaborador).

## 1. Nome x Categoria

Hoje o formulário pede um nome livre e, mais abaixo, uma categoria (Abertura, Almoço, Jantar, Fechamento, Delivery, Administrativo, Personalizado) — de fato, na prática o usuário digita o mesmo que a categoria já diz.

Mudança:
- A categoria passa a ser o primeiro campo e a definir o turno.
- O nome deixa de ser digitado: é gerado automaticamente a partir da categoria + horário (ex.: "Jantar 17:00–23:00") e mostrado como prévia.
- Um campo opcional "Apelido" fica recolhido atrás de "Personalizar nome", para quem tem dois turnos da mesma categoria (ex.: "Jantar Salão" e "Jantar Delivery"). Se preenchido, é ele que aparece na escala.
- Nada muda no banco: a coluna de nome continua existindo e passa a ser preenchida pelo sistema.

## 2. Intervalo abaixo da CLT exige ciência registrada

Hoje o intervalo insuficiente (menos de 1h em turnos acima de 6h, menos de 15min entre 4h e 6h) só gera um aviso amarelo que pode ser ignorado sem rastro.

Mudança:
- O aviso passa a ser um bloco destacado explicando a referência legal (art. 71 da CLT) e o risco.
- Salvar com intervalo abaixo do mínimo abre o mesmo diálogo de ciência já usado nas regras de folga (`CienciaLegalDialog`): checkbox obrigatório de ciência + justificativa opcional (ex.: acordo coletivo).
- A confirmação é gravada no histórico de regras (usuário, horário, valores e justificativa), com `ciencia_confirmada = true`, servindo de prova de que a decisão foi da empresa.
- Sem ciência, o salvamento não prossegue. Intervalo maior que a duração do turno continua sendo erro puro (nunca liberado por ciência).

## 3. Fim dos campos de vigência

Vigência início/fim saem do formulário. O empresário cadastra o turno sem saber quando vai mudá-lo.

Mudança:
- Os dois campos de data desaparecem da tela.
- Ao editar um turno já em uso, o sistema continua oferecendo as duas saídas de hoje (editar no lugar ou criar nova versão preservando escalas publicadas), mas as datas de vigência são preenchidas automaticamente pelo sistema (nova versão começa hoje, versão anterior encerra hoje).
- Toda alteração de turno passa a gravar um registro no histórico de regras com o antes e o depois — é isso que substitui o controle manual de vigência.
- As colunas de vigência permanecem no banco (usadas pelo versionamento e pela cobertura mínima); só deixam de ser editadas à mão.

## Detalhes técnicos

- `src/lib/dp/turno-utils.ts`: `nomeSugeridoTurno(categoria, entrada, saida)`, `intervaloMinimoLegal(cargaHoras)` e `intervaloAbaixoDoLegal(...)` retornando o alerta em formato `AlertaCiencia`; validações de vigência deixam de ser exercidas pelo formulário.
- `src/components/dp/TurnoForm.tsx`: reordena os campos (categoria → horários → intervalo → apelido opcional), remove os inputs de vigência e dispara `CienciaLegalDialog` no submit quando há intervalo abaixo do legal; `onSubmit` passa a receber `{ form, ciencia }`.
- `src/hooks/useDpTurnos.tsx`: `criar`/`atualizar`/`novaVersao` gravam em `dp_regras_historico` (`tabela = 'dp_turnos'`, `valor_antigo`/`valor_novo`, `justificativa`, `ciencia_confirmada`); `nome` é derivado quando o apelido está vazio.
- `src/pages/dp/cadastros/DpTurnos.tsx` e `src/components/dp/ColaboradorConfigTrabalhoDialog.tsx`: ajustam a chamada de `onSubmit`.
- Testes novos em `src/lib/dp/__tests__/turno-utils.test.ts` para nome sugerido e detecção do intervalo abaixo do mínimo.
- Sem mudanças de banco de dados.
