# Corrigir o padrão de remuneração que não replica as regras do VA/VT

## O que aconteceu

Confirmei no banco: o padrão da empresa salvo às 17:21 tem "VA desconta atestado" ligado, e a Hanna ficou com o campo ligado. Mas os colaboradores atingidos pela replicação (Rosângela, Nordman, Sara, Herick, Alessandra) continuaram com esse campo vazio, e a Cristiane nem entrou no lote.

Causa: a função que traduz o padrão em colunas do colaborador só cobre os campos antigos (valor, periodicidade, dias base, desconto). Os campos novos do ciclo de vales — dia de pagamento, dias de corte e os quatro "desconta em" (falta, folga extra, atestado, férias), tanto de VA quanto de VT — ficaram de fora. Como a mesma função também alimenta a comparação "quem está fora do padrão", a Cristiane apareceu como já conforme e não foi pré-selecionada.

## O que vou fazer

1. **Completar a tradução padrão → colaborador**
   Incluir na replicação todos os campos do ciclo de vales:
   - VA: dia de pagamento, dias de corte, desconta falta / folga extra / atestado / férias.
   - VT: dia de pagamento, dias de corte, desconta falta / folga extra / atestado / férias.
   Com as mesmas regras de coerência já usadas: se o vale está desligado no padrão, esses campos vão nulos; se está ligado, valem os valores do padrão (dia de pagamento e corte como número, os "desconta" como sim/não).

2. **Comparação passa a enxergar esses campos**
   Por usar a mesma função, o aviso "fora do padrão de remuneração", a contagem no diálogo e o atalho "Só os fora do padrão" passam a considerar dia de pagamento, corte e descontos. Colaboradores como a Cristiane vão aparecer corretamente como divergentes.

3. **Regularizar quem ficou pela metade**
   Aplicar o padrão vigente da empresa aos colaboradores ativos que hoje estão com esses campos vazios ou diferentes, para que o cadastro reflita a decisão já tomada (VA dia 25, corte 5 dias, descontos ligados). Sem tocar em quem tem exceção intencional já registrada com o benefício desligado.

4. **Testes**
   Ampliar os testes do padrão de remuneração cobrindo: os campos novos entram na replicação, vão nulos quando o vale está desligado, e a divergência é detectada quando só o "desconta atestado" difere.

## Detalhes técnicos

- `src/lib/dp/beneficiosPadrao.ts`: acrescentar as chaves faltantes ao objeto `todas` de `padraoParaColunasColaborador` (já filtrado por grupo via `CAMPOS_POR_GRUPO`, que inclui esses campos). Rótulos já existem em `ROTULOS`.
- `src/hooks/useDpBeneficiosPadrao.tsx` e `ColaboradorFormDialog.tsx` não precisam mudar — consomem a mesma função.
- Passo 3 é uma atualização de dados nos colaboradores ativos da empresa, alinhando as colunas de VA/VT ao payload do padrão atual.
- `src/lib/dp/__tests__/padraoRemuneracao.test.ts`: novos casos.
