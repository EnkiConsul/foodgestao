# Logo em fundo claro + pendências de contracheque, folha de ponto e adiantamento

## 1. Logo para fundo claro

A logo enviada (símbolo verde com "AVETO 360" em preto) passa a ser a versão usada sempre que o fundo é claro:

- Tela de login e primeiro acesso
- Onboarding
- Cabeçalho do app em tema claro
- Documentos e telas de impressão (holerite, recibos, relatórios)

Em fundo escuro (menu lateral, tema escuro) continua a versão atual, para não perder contraste. A imagem é publicada no CDN de imagens do projeto, sem deixar arquivo pesado no código.

## 2. Pendências que não apareciam

Diagnóstico confirmado: as pendências de **Contracheque**, **Folha de ponto** e **Adiantamento** existem e funcionam, mas só começam a aparecer a partir da data limite configurada — dia 10 para contracheque e folha de ponto, e dia do adiantamento + 5 (dia 20 na sua empresa). Como hoje é dia 9, nada aparecia.

Mudança aprovada: passam a aparecer **desde o dia 1**, assim:

- Antes da data limite: aparecem como pendência **próxima** ("a importar"), sem alarme de atraso.
- Na data limite: **vence hoje**.
- Depois: **atrasada**, com a contagem de dias, como já acontece.

Regras mantidas:

- Contracheque e folha de ponto seguem se referindo à competência do mês anterior; adiantamento ao mês vigente.
- Folha de ponto só é cobrada de unidades que registram ponto; adiantamento só de unidades que pagam adiantamento (com o dia informado).
- Se o documento da competência já foi importado, a pendência não aparece.
- As datas limite continuam configuráveis em Prazos e pendências.

## Detalhes técnicos

- Novo asset `src/assets/aveto360-horizontal-light.png.asset.json` criado via `lovable-assets create` a partir do upload; `src/components/Logo.tsx` ganha resolução por tema/fundo (nova variante para fundo claro) e `src/pages/Auth.tsx` + `src/components/onboarding/food/OnboardingShell.tsx` passam a usá-la. Varredura em templates de impressão/PDF (holerite, TRCT, recibos) para aplicar a mesma versão onde houver logo.
- `src/hooks/useDpPendencias.tsx`: remover os gates `if (diaHoje >= cfg.alerta_contracheque_dia_mes)` e `if (diaHoje >= cfg.alerta_folha_ponto_dia_mes)`, e o `if (diaHoje < diaLimite) continue` do adiantamento. O `vencimento` continua sendo a data limite configurada e o `atrasoDias` negativo já é classificado como `proxima` por `urgenciaDe` em `src/lib/dp/pendencias.ts` — nenhuma mudança em agrupamento, KPI ou tela.
- Nenhuma alteração de banco, RLS, permissões ou multiempresa.
- Testes: casos em `src/lib/dp/__tests__` cobrindo classificação antes/na/depois da data limite, unidade sem relógio de ponto e unidade sem adiantamento; typecheck e suíte DP.
