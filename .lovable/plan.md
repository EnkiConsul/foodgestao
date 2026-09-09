# Logo em fundo claro + pendências de contracheque, folha de ponto e adiantamento

## 1. Logo para fundo claro

A logo enviada (símbolo verde com "AVETO 360" em preto) passa a ser a versão usada sempre que o fundo é claro:

- Tela de login e primeiro acesso
- Onboarding
- Cabeçalho do app em tema claro
- Documentos e telas de impressão (holerite, recibos, relatórios)

Em fundo escuro (menu lateral, tema escuro) continua a versão atual, para não perder contraste. A imagem é publicada no CDN de imagens do projeto, sem deixar arquivo pesado no código.

## 2. Pendências que não apareciam

Dois problemas confirmados nos seus dados:

**a) Só avisava a partir da data limite.** Contracheque e folha de ponto começam no dia 10 e adiantamento no dia do adiantamento + 5 (dia 20 na sua empresa). Como hoje é dia 9, nada aparecia.

**b) Só o mês anterior era verificado.** O sistema olhava apenas uma competência: contracheque/ponto do mês anterior e adiantamento do mês vigente. Nas suas unidades os últimos envios foram contracheque 05 e 06, adiantamento 06 e folha de ponto 05 — ou seja, contracheque 07, folha de ponto 06 e 07 e adiantamento 07 e 08 estão em falta e nunca eram cobrados.

Como fica:

- Cada competência em falta gera sua própria pendência, por unidade: "Contracheque não importado — Pakerê T-63 — julho/2026", e assim por diante.
- A verificação começa **uma competência antes do mês em que a unidade foi cadastrada** no sistema e vai até a competência atual. Importar algo mais antigo que isso continua livre, mas o sistema não cobra.
- Nas unidades da Pakerê (cadastradas em junho/2026), a cobrança vai de maio/2026 até agora: contracheque de julho e agosto, folha de ponto de junho a agosto (só na unidade com relógio) e adiantamento de maio, julho e agosto passam a aparecer como atrasados.
- A competência atual aparece desde o dia 1 como **a importar** (próxima), vira **vence hoje** na data limite e depois **atrasada** com a contagem de dias.
- Os meses já vencidos aparecem como **atrasados**, com o mais antigo em primeiro.

Regras mantidas:

- Folha de ponto só é cobrada de unidades que registram ponto; adiantamento só de unidades que pagam adiantamento (com o dia informado).
- Se o documento da competência já foi importado, a pendência não aparece.
- As datas limite continuam configuráveis em Prazos e pendências.

## Detalhes técnicos

- Novo asset `src/assets/aveto360-horizontal-light.png.asset.json` criado via `lovable-assets create` a partir do upload; `src/components/Logo.tsx` ganha resolução por tema/fundo (nova variante para fundo claro) e `src/pages/Auth.tsx` + `src/components/onboarding/food/OnboardingShell.tsx` passam a usá-la. Varredura em templates de impressão/PDF (holerite, TRCT, recibos) para aplicar a mesma versão onde houver logo.
- `src/hooks/useDpPendencias.tsx`: remover os gates `if (diaHoje >= cfg.alerta_contracheque_dia_mes)`, `if (diaHoje >= cfg.alerta_folha_ponto_dia_mes)` e `if (diaHoje < diaLimite) continue`; trocar a checagem de competência única por um laço sobre as últimas 6 competências, com uma única consulta em `dp_documentos` por tipo cobrindo todo o intervalo (agrupando por unidade + competência, sem N+1). `id` da pendência continua `tipo-unidade-ano-mes`, então adiamentos já registrados seguem válidos.
- Novo módulo puro `src/lib/dp/pendencias-documentos.ts` com o cálculo de competências esperadas, data limite por competência e classificação, para poder ser testado sem banco; o hook passa a consumi-lo.
- `atrasoDias` negativo já é classificado como `proxima` por `urgenciaDe` em `src/lib/dp/pendencias.ts` — nenhuma mudança em agrupamento, KPI ou tela.
- Nenhuma alteração de banco, RLS, permissões ou multiempresa.
- Testes em `src/lib/dp/__tests__`: competência atual antes/na/depois da data limite, meses anteriores em falta gerando uma pendência cada, competência já importada não gerando pendência, unidade sem relógio de ponto e unidade sem adiantamento; typecheck e suíte DP.

