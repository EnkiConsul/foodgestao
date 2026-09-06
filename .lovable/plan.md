# Conformidade de DSR: "Conforme" indevido e folgas marcadas invisíveis

## O que está acontecendo (verificado nos dados desta empresa)

As duas unidades (Pakerê Garavelo e Pakerê T-63) estão configuradas no modelo
**"X folgas de fim de semana por mês" = 1**, com dias de descanso negociados
sábado e domingo.

1. **Todos aparecem "Conforme" com mínimo esperado 0.**
   A avaliação converte "1 por mês" em "1 a cada 4,3 semanas" e depois divide os
   4 domingos do mês por 4,3 — o resultado arredonda para baixo e dá **0**. Com
   mínimo 0, qualquer pessoa passa como conforme, mesmo sem nenhuma folga.
   É isso que produz a coluna "4.3 sem." e o selo verde geral da tela.

2. **Folga marcada não aparece.**
   Em setembro/2026 existe uma folga registrada: Rosângela em 05/09 (sábado).
   A tela só conta domingos na coluna "Folgados", e a coluna de dias negociados
   só mostra o que "faltava" para atingir o mínimo — como o mínimo está em 0,
   ela mostra 0 também. Resultado: a folga existe e a tela não indica nada.

## Correções

### 1. Mínimo esperado respeita o modelo "por mês"
Quando a unidade usa "X folgas por mês", o mínimo passa a ser a quantidade
configurada (limitada aos domingos/dias existentes no mês) em vez da conversão
para semanas. O modelo "a cada X semanas" continua igual. Com a configuração
atual, o mínimo de cada colaborador em setembro passa a ser 1.

### 2. Coluna "Folgas no mês" mostrando o que foi marcado
Nova coluna com o total de folgas registradas em dias de descanso da unidade
(domingo e, no modo acordo, os dias negociados), independente do mínimo. As
colunas atuais de domingos e de dias negociados aproveitados continuam, para o
gestor ver de onde vem o cálculo. Quem não tem nenhuma folga marcada recebe o
aviso "Sem folga marcada" na linha.

### 3. Texto da periodicidade coerente com a regra
No cabeçalho e na coluna de periodicidade, quando a unidade usa "por mês" o
texto passa a ser "1 folga de fim de semana por mês" (ou "1 domingo por mês",
conforme os dias marcados) em vez de "4.3 sem.". O resumo do topo passa a
refletir a regra de cada unidade quando as unidades divergem do padrão da
empresa.

## Detalhes técnicos

- `src/lib/dp/dsr-rules.ts`
  - `avaliarConformidade` deixa de derivar `esperado` de `semanasDaConfig` +
    `domingosEsperados` e passa a usar `domingosFolgaNoPeriodo` (já trata
    `por_mes` corretamente, incluindo a variante feminina e o override
    individual `domingos_folga_mes`).
  - `ConformidadeLinha` ganha `folgasMarcadas` (domingos + dias negociados
    marcados, sem teto) e `modoAplicado: ModoFrequencia` para o rótulo.
  - Novo helper `rotuloFrequencia(cfg, tipoDias)` reaproveitando
    `modoFrequenciaLabel`/`tipoDiasDescanso` para o texto por unidade.
- `src/pages/dp/DpConformidadeDsr.tsx`: nova coluna "Folgas no mês" (tabela e
  cartões mobile), badge "Sem folga marcada", rótulo de periodicidade por
  unidade, CSV com a nova coluna. Sem `as any`.
- Testes em `src/lib/dp/__tests__/dsr-rules.test.ts`: modelo `por_mes` com 4 e 5
  domingos, modelo `semanas` (regressão), acordo coletivo com folga em sábado
  contando como cumprida, e caso sem folga marcada = fora de conformidade.
- Sem alteração de banco.
