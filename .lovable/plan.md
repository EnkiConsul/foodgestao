# O que ficou faltando

Conferi o módulo Pessoas item por item: as três frentes (Ocorrências etapa 2, anexo da ficha de registro e Ocorrências etapa 3) estão implementadas e o typecheck passa. Sobraram só quatro acabamentos pequenos.

## 1. Nomes repetidos na janela de detalhe do dia

Na Rotina do Dia, quem tem atraso ou saída antecipada aparece duas vezes na mesma lista quando você abre o detalhe de uma categoria (uma vez pelo trabalho previsto, outra pela ocorrência). Corrigir para que cada pessoa apareça uma única vez por lista.

## 2. Atalho da Rotina do Dia não abre o dia certo

O selo de ocorrência leva para a lista de Ocorrências já filtrada pela pessoa, mas não pelo dia clicado — abre o mês inteiro. Passar também a data e aplicá-la ao filtro de período.

## 3. Lista de pessoas no filtro de Ocorrências

Quando a lista chega pelo atalho com uma pessoa escolhida, o seletor de colaborador mostra todos os nomes sem destacar quem está filtrado. Ajustar para que a pessoa filtrada apareça selecionada e visível no seletor.

## 4. Roadmap desatualizado

`roadmap.md` ainda lista Ocorrências etapas 1, 2 e 3 e Férias etapa 4 como pendentes, mesmo estando entregues. Marcar como concluídas.

## Detalhes técnicos

- `src/pages/dp/DpOperacaoPanorama.tsx`: usar `key={p.ocorrencia_id ?? p.colaborador_id}` nas listas (`foraDaOperacao`, `pessoasDaCategoria`, diálogos de sócios/avulsos) e deduplicar `pessoasDaCategoria` por `colaborador_id` na categoria que já contém a pessoa.
- Link do selo: incluir `&data=<yyyy-mm-dd>`; em `DpOcorrencias.tsx` ler `searchParams.get("data")` e inicializar `periodo: "dia"` com essa data (ou intervalo do dia, conforme os filtros existentes).
- `DpOcorrencias.tsx`: garantir que `colaboradorId` do parâmetro esteja presente entre as opções do `Select` mesmo que o colaborador esteja inativo.
- `roadmap.md`: marcar `[x]` nas linhas de Férias etapa 4 e Ocorrências etapas 1–3.
- Verificação mínima: `bunx tsgo --noEmit -p tsconfig.json` e uma conferência visual em `/dp/escalas/mes` e `/dp/ocorrencias`.
