# Convocação: rolagem da tela e etapa de revisão antes de publicar

## 1. A tela não rola

O corpo da janela "Nova convocação" está numa área de rolagem que não recebe altura própria dentro da janela, então o conteúdo que passa da altura da tela fica escondido e a roda do mouse não faz nada. Vou corrigir a altura dessa área para que o conteúdo entre unidade/cargos e os alertas do fim role normalmente, com o cabeçalho e o rodapé de botões fixos. As listas internas (colaboradores, dias escolhidos) deixam de ter rolagem própria concorrente onde ela hoje atrapalha.

## 2. Revisar antes de publicar

O botão "Publicar" passa a se chamar **"Revisar e publicar"** e abre uma etapa de revisão (sem gravar nada ainda), com:

**Resumo da convocação**
- Unidade, mês, título e observação.
- Quantos dias, quantas vagas no total e quantos destinatários.
- Avisos que impedem ou pesam na publicação: dias sem horário, dias abaixo da antecedência mínima (com a justificativa digitada), dias com vagas acima da necessidade.

**Como o colaborador vai receber**
Um card por pessoa convocada, mostrando exatamente o que aparece para ela: os dias em que será chamada, o horário resolvido de cada dia (ajuste individual > horário padrão da convocação > jornada cadastrada dela), duração prevista e o prazo para responder. Quem não recebe nenhum dia aparece destacado, para o gestor perceber antes de enviar.

**Simulação da rotina do dia**
Para cada dia escolhido, o quadro da unidade como ficará **se todos aceitarem**: as pessoas já previstas naquele dia, separadas pelos períodos de funcionamento da loja (ex.: Dia e Noite), com os convocados inseridos e marcados como "convocado (aguardando)". Junto de cada dia: total de pessoas antes e depois, e a comparação com a necessidade mínima do cargo. Um seletor de dia mantém a leitura enxuta quando houver muitos dias.

No rodapé da revisão: "Voltar e ajustar" e "Confirmar e publicar" — só esse último publica. "Salvar rascunho" continua disponível na tela principal.

## Detalhes técnicos

- `src/components/dp/convocacoes/NovaConvocacaoPlanner.tsx`: `ScrollArea` do corpo ganha `min-h-0` (item flex não encolhe hoje, daí a rolagem morta); remover o `max-h-56 overflow-y-auto` da grade de colaboradores em favor da rolagem única do diálogo. Novo estado `revisando: boolean`; o botão principal abre a revisão e `publicarGrupo` só é chamado no "Confirmar e publicar".
- Novo componente `src/components/dp/convocacoes/RevisaoConvocacao.tsx` (apresentação; recebe por props unidade, competência, dias planejados, destinatários, overrides, horário geral, cobertura e avisos já calculados no planner). Sem `as any`.
- Novo módulo puro `src/lib/dp/convocacao-revisao.ts` com `resolverHorarioDestinatario()` (override individual > horário geral > jornada do dia da pessoa, reusando `jornadaIndividualNaData`/`cargaPrevistaHoras` de `convocacoes-planejamento.ts`) e `simularDia()` (pessoas previstas + convocados, devolvendo totais antes/depois). Testes unitários em `src/lib/dp/__tests__/convocacao-revisao.test.ts`.
- Simulação da rotina: reusar `useDpOperacaoPanorama(competencia, unidadeId)` (`dias`, `funcionamentoPorUnidade`, `unidades`, `cargos`) e `blocosPorFuncionamento` de `src/lib/dp/operacao-panorama.ts`, injetando as pessoas convocadas como `PessoaPanorama` com `categoria: "convocado_pendente"`; o hook só é ativado quando a revisão está aberta.
- Nada de banco novo, nenhuma mudança nas RPCs de publicação nem no fluxo de rascunho.
- Validação: `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx eslint`, `bunx vitest run src/lib/dp/__tests__` e conferência com Playwright em `/dp/convocacoes` (rolagem do diálogo e etapa de revisão com a simulação do dia).

## Fora de escopo

- Mudar regras de elegibilidade, vagas, antecedência ou o que o backend valida na publicação.
- Envio por WhatsApp/e-mail e edição do texto da oferta.
