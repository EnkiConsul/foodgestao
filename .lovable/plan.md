# Mostrar quem está pendente em cada pendência de unidade

## O que está acontecendo

A pendência de adiantamento de maio da Pakerê Garavelo aparece só como
"PAKERÊ GARAVELO — 2026-05". Os nomes das 5 pessoas que faltam já são apurados
e guardados junto da pendência, mas nenhuma tela mostra essa lista. Por isso,
quando parte das pessoas já teve documento anexado, não há como saber quem
ainda está faltando — foi o que aconteceu com o Herick.

Observação: o Herick hoje está sem a marcação de adiantamento, então ele não
entra mais nessa cobrança. Os nomes que estão faltando nessa pendência de maio
são Cristiane, Hanna, Karine, Kassiane e Sara.

## O que vai mudar

1. **Nomes visíveis na pendência da unidade**
   - Na tela Início (ao abrir o grupo de pendências) e na lista completa de
     Pendências, a pendência de unidade passa a mostrar, abaixo do texto atual,
     os nomes de quem está faltando: "Faltam: CRISTIANE, HANNA, KARINE…".
   - Com muitos nomes, mostra os primeiros e "e mais N"; ao toque/clique em
     "e mais N" a lista completa aparece.
   - Quem foi desligado continua sinalizado ao lado do nome, como já acontece
     nas pendências individuais.

2. **Contagem honesta**
   - O rótulo passa a dizer "5 pessoas pendentes" em vez de apenas a unidade,
     e essa contagem acompanha o que foi importado: ao anexar o documento de
     uma pessoa, o nome sai da lista na apuração seguinte.

3. **Quando a falta é parcial, a cobrança já é individual**
   - Essa regra continua: se só algumas pessoas estão faltando, cada uma vira
     uma pendência com o próprio nome. A lista de nomes resolve o caso em que
     todas ainda estão faltando (pendência única da unidade).

4. **Busca por nome**
   - Na lista completa de Pendências, procurar por um nome também encontra a
     pendência de unidade onde essa pessoa está faltando.

## Detalhes técnicos

- Sem mudança de banco. Os campos `pessoas`, `escopo` e `total_elegiveis` já
  vêm de `dp_pendencias_materializadas` e do cálculo em `useDpPendencias`.
- Novo componente `src/components/dp/pendencias/PendenciaPessoas.tsx`: recebe
  `pendencia.pessoas`, mostra até 3 nomes com marcação de desligamento e
  expande o restante sob demanda.
- Usado em `src/components/dp/home/PendenciasCard.tsx` (detalhe do grupo) e em
  `src/pages/dp/cadastros/DpCadastroPendenciasLista.tsx` (cartões da lista).
- Em `DpCadastroPendenciasLista.tsx`, incluir `p.pessoas` no texto pesquisado.
- Teste em `src/components/dp/pendencias/PendenciaPessoas.test.tsx`: nomes
  exibidos, "e mais N" e selo de desligado; rodar Vitest e o typecheck.
