# Convocação de hoje: avisar antes, não só na publicação

## O que acontece hoje

Ao montar a convocação, o calendário só bloqueia datas anteriores a hoje. O dia de hoje é aceito normalmente, com horário, vagas e pessoas — e a recusa só aparece no final, na publicação, quando o sistema verifica que o horário de entrada já passou. Foi o caso de 12/09 com entrada às 16:30 tentada às 20:54.

Ou seja: a regra é correta (não se convoca alguém para um turno que já começou), mas ela chega tarde e depois de todo o trabalho preenchido.

## O que vai mudar

1. **Aviso no momento de escolher o dia**
   - No calendário, hoje aparece como "só horário depois de agora", e fica bloqueado quando não há mais nenhum horário possível no dia.
   - Ao selecionar hoje, a tela já diz: "Hoje só aceita horário de início a partir de agora".

2. **Aviso no dia já preenchido**
   - Se a entrada informada para hoje já passou, o dia fica marcado em vermelho com a frase "Este horário já começou — ajuste a entrada ou remova o dia", junto ao campo de horário.

3. **Salvar e publicar param no lugar certo**
   - Salvar rascunho continua permitido (o gestor pode estar montando algo para depois), mas com aviso claro de que aquele dia não poderá ser publicado assim.
   - Publicar só é bloqueado por esse motivo antes de chamar o servidor, com a lista dos dias em conflito e rolagem até o primeiro deles — sem mensagem técnica e sem pedir para falar com o suporte.

4. **Se ainda assim o servidor recusar** (por exemplo, o horário virou passado durante o preenchimento), a mensagem passa a ser "O horário de DD/MM já começou. Ajuste a entrada ou tire esse dia da convocação." em vez do texto atual.

## Detalhes técnicos

- Nova função pura em `src/lib/dp/convocacoes-planejamento.ts`: `horarioJaComecou(dataISO, entrada, agora)` e `diaSemHorarioPossivel(dataISO, agora)`, espelhando a regra de `dp_convocacao_publicar_grupo` (`data + necessidade_entrada <= now()`), com testes unitários.
- `NovaConvocacaoPlanner.tsx`: `infoDias` passa a marcar hoje com selo/título próprio e `desabilitado` quando o dia inteiro já passou; `diasCompletos`/`publicarGrupo` ganham a checagem `horarioJaComecou` antes do `persistir()`, reaproveitando `setFocoPendente` e `setDataComErro` já existentes; nenhum novo estado global.
- `DiasSelecionadosLista.tsx`: estilo de erro e texto de ajuda no dia cujo horário já passou.
- `src/lib/dp/convocacoes-motivos.ts`: tradução de `OCCURRENCE_ALREADY_STARTED` e `OFFER_ALREADY_STARTED` com a data formatada.
- Fuso: o servidor usa o timezone da unidade (`dp_convocacao_timezone`); a tela usa a hora do aparelho. Para evitar divergência de minutos na borda, o aviso da tela usa margem de 5 minutos — o servidor continua sendo a autoridade final.
- Nenhuma migração de banco. Validação: `bunx tsc --noEmit`, vitest das funções puras e Playwright em 390x844 no rascunho da Pakerê.
