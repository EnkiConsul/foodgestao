# Calendário de folgas sem o atalho de ausência e jornada da noite correta

## 1. Tirar o link "Registrar ausência" do calendário de folgas

No detalhe do dia em Pessoas > Folgas existe hoje o link "Registrar ausência (férias, atestado, período)", que leva para a tela de operação. Ele sai da tela — o registro de ausência continua disponível no Painel da Operação, onde já existe o botão próprio.

## 2. Turno predominante: quem entra às 17:00 conta como Noite

Hoje a pessoa é colocada no período em que o **horário de entrada** cai. Com funcionamento "Dia 08:30–18:30" e "Noite 17:00–00:35", quem trabalha 17:00–00:35 tem a entrada dentro do Dia e aparece toda no bloco do Dia, mesmo com quase toda a jornada à noite.

A regra passa a ser o **tempo de trabalho em cada período**: a pessoa fica no período com maior sobreposição de horas com a jornada dela. No exemplo, 17:00–00:35 tem 1h30 no Dia e 7h35 na Noite, então entra na Noite. Empate resolve pelo período em que a entrada cai; sem nenhuma sobreposição, continua indo para "Fora do Horário de Funcionamento".

Efeito na tela: os quatro nomes que hoje aparecem no bloco "Dia" passam para o bloco "Noite", e as contagens de pessoas por período passam a refletir isso — na aba Dia, na janela do dia e nos números do mês.

## Detalhes técnicos

- `src/lib/dp/operacao-panorama.ts`: inverter a prioridade em `melhorPeriodo` — calcular `sobreposicao` para todas as janelas e escolher a maior; usar "entrada contida na janela" apenas como critério de desempate; manter `null` quando não há sobreposição alguma.
- `src/lib/dp/__tests__/operacao-panorama.test.ts`: ajustar/adicionar casos — 17:00–00:35 com Dia 08:30–18:30 + Noite 17:00–00:35 cai na Noite; jornada 09:00–17:30 cai no Dia; empate usa a entrada; sem sobreposição vai para fora do horário.
- `src/pages/dp/DpFolgas.tsx`: remover o `<button>` de "Registrar ausência" (linhas 1363-1371) e os imports/uso de `navigate` que ficarem sem utilidade.
- Validação: `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx eslint`, `bunx vitest run src/lib/dp/__tests__` e conferência com Playwright em `/dp/escalas/mes` (bloco Noite com as 4 pessoas) e `/dp/folgas`.

## Fora de escopo

- Mudanças no cadastro de funcionamento da unidade, nos turnos ou no banco.
- Alterar o registro de ausência no Painel da Operação.
