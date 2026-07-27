## Objetivo

Manter a lógica atual (dias negociados = leque de opções; quantidade de folgas = teto mensal) e deixar isso **explícito na interface**, para não haver dúvida de que marcar mais dias não aumenta o número de folgas.

## 1. Tela "Regras de Folgas" (`/dp/folgas/configuracoes/regras`)

No bloco **Dias de descanso negociados**, abaixo dos chips Seg→Dom:

- Texto de apoio: "Os dias marcados são as **opções** que o colaborador pode escolher no calendário. Marcar mais dias não aumenta a quantidade de folgas."
- Linha de resumo dinâmica, calculada com os valores já configurados: "Com esta configuração, o colaborador escolhe até **X folga(s) por mês** entre os dias marcados." — X vem de `tetoFolgasMes(config)`.
- Ícone "i" com popover curto explicando a composição do teto: menor valor entre o teto de folgas por mês e o derivado da frequência de folga dominical.

## 2. Portal do colaborador

- No calendário (`/dp/meu/calendario`) e no formulário de solicitação: legenda no topo com "Você pode escolher entre: Seg, Qua, Dom — até X folga(s) neste mês", usando os mesmos dias elegíveis e teto que o motor já aplica.
- Sem mudança de regra: os bloqueios e a mensagem "Teto do mês" continuam como estão.

## Detalhes técnicos

- Sem migração de banco e sem mudança de lógica em `src/lib/dp/folga-rules.ts` nem em `diasElegiveisDaConfig` / `tetoFolgasMes`.
- `src/lib/dp/dsr-rules.ts`: adicionar helper puro `resumoEscolhaFolgas(cfg)` retornando `{ dias: number[], teto: number, texto: string }` para reaproveitar nas três telas.
- `src/pages/dp/cadastros/DpConfiguracoesJornada.tsx`: textos de apoio + popover no bloco de dias negociados.
- `src/pages/dp/portal/DpMeuCalendario.tsx` e `src/pages/dp/portal/DpMeuSolicitacoes.tsx`: exibir a legenda usando `useDpRegrasColaborador` (já consumido nessas telas).
- Teste: caso em `src/lib/dp/__tests__/dsr-rules.test.ts` cobrindo `resumoEscolhaFolgas` com 3 dias marcados e teto 1.
