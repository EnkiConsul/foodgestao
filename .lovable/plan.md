# Corrigir o turno fantasma 11:00 → 23:00 no funcionamento da unidade

## O que está acontecendo

Confirmado no código: ao abrir o editor de funcionamento, todo dia sem horário salvo é montado já **aberto** e com um período pré-preenchido de **11:00 → 23:00** (`funcionamentoVazio` em `src/lib/dp/turno-utils.ts`).

Efeito prático:

1. Você cadastrou o período "Dia" na Garavelo.
2. Pediu para replicar nos outros dias.
3. A replicação **acrescenta** o período copiado à lista do dia de destino — que já tinha o 11:00 → 23:00 sugerido pelo sistema. Resultado: dois períodos por dia.

Também confirmei que ainda não há nenhum horário de funcionamento gravado no banco (nenhuma unidade), então não há dado sujo para limpar: basta corrigir o comportamento e cadastrar de novo.

## Correções

1. **Dia sem horário começa fechado e vazio.** Nenhum horário sugerido automaticamente. O dia só passa a ter período quando você liga a chave "aberto" ou adiciona um período.
2. **Ligar a chave do dia cria um período em branco** (Abre/Fecha vazios) em vez de 11:00 → 23:00, para não gravar horário que você não escolheu.
3. **Replicar em outros dias substitui o dia inteiro** por padrão: o dia de destino fica exatamente com os períodos copiados. Para os casos em que você quer somar (ex.: replicar o Jantar em dias que já têm Almoço), o botão passa a ter duas ações claras: **Substituir horário do dia** e **Adicionar como período extra**.
4. **Não salvar período incompleto:** dias abertos com Abre/Fecha em branco são avisados e não geram linha no banco.

## Como fica na prática (Garavelo)

- Cadastra "Dia" 11:00 → 23:00 na segunda.
- Replicar > Substituir horário do dia > marca ter–dom: todos ficam apenas com "Dia" 11:00 → 23:00.
- Se depois quiser um período de madrugada só na sexta e sábado: cria na sexta e usa Replicar > Adicionar como período extra em sábado.

## Detalhes técnicos

- `src/lib/dp/turno-utils.ts`: `funcionamentoVazio` passa a retornar `aberto: false` e `periodos: []`; `periodoVazio` retorna horas `null`.
- `src/components/dp/HorarioFuncionamentoEditor.tsx`: ao ligar a chave do dia, cria um período em branco se não houver nenhum; `aplicarEmDias` recebe modo `substituir | adicionar`; o popover de replicação ganha a escolha do modo; validação bloqueia salvar período incompleto.
- `src/hooks/useDpHorariosFuncionamento.tsx`: continua apagando e regravando por unidade; períodos sem hora são descartados antes do insert.
- Testes em `src/lib/dp/__tests__/turno-utils.test.ts` cobrindo dia vazio (fechado) e resumo semanal.
