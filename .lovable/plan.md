# Pendência individual de documentos + ordenação por atraso

## 1. Por que a Karine não aparece no Início

Verificado no código: a pendência de contracheque do painel de Início é gerada **por unidade + mês**. Basta existir um contracheque de qualquer pessoa daquela unidade naquele mês para o sistema considerar tudo em ordem. Como o lote de julho/2026 foi salvo com os demais colaboradores, a falta da Karine deixou de ser cobrada ali — ela aparece só na Conferência de Documentos.

## 2. O que muda

**Todos os documentos do colaborador passam a ser conferidos pessoa a pessoa** no painel de Início — contracheque, adiantamento e folha de ponto — já que podem ser enviados em lote ou individualmente. Vale a mesma regra da Conferência de Documentos (quem estava no quadro na competência, incluindo desligados no meio do mês; contracheque só para regimes assalariados; adiantamento só para quem é optante; folha de ponto só em unidade com relógio e para quem tem folha de ponto marcada):

- Falta para todos os elegíveis da unidade no mês → uma pendência única "… não importado — <unidade> — <mês>" (como hoje).
- Falta só para algumas pessoas → uma pendência por pessoa, com nome do colaborador, unidade e selo de desligamento quando for o caso.

**Ordenação por atraso (mais antigo primeiro)** em todos os lugares:

- Início: os cartões por assunto passam a vir ordenados pelo maior atraso; dentro de cada detalhe, os itens vêm do mais atrasado/mais antigo para o mais recente.
- Tela "Ver todas" (lista completa de pendências): mesma ordem.
- Conferência de Documentos: os blocos passam a listar a **competência mais antiga primeiro** (hoje é a mais recente primeiro), mantendo o desempate por tipo e unidade; os avisos "a vencer" seguem a mesma ordem.

## Detalhes técnicos

- `src/hooks/useDpPendencias.tsx`
  - A consulta de colaboradores passa a trazer `nome, regime, ativo, data_admissao, data_desligamento` (já traz `unidade_id`).
  - `carregarTipo("contracheque")` passa a indexar por `colaborador_id:competencia` além de `unidade:competencia`.
  - Elegibilidade por competência via `ativoNaCompetencia` (`src/lib/dp/bulk-coverage.ts`) + regimes assalariados (mesma lista do `DocConsistenciaPanel`), sem duplicar regra: extrair o predicado para `src/lib/dp/pendencias-documentos.ts` se necessário.
  - Se nenhum elegível da unidade tem o documento → 1 item por unidade (id atual preservado). Se parcial → 1 item por colaborador com id `contracheque-<colaborador>-<comp>`, `colaboradorNome` e `unidadeNome` preenchidos.
- `src/lib/dp/pendencias.ts`: `agruparPorTipo` ordena grupos por `maiorAtraso` desc (depois total e nome); `agruparPorColaborador` mantém itens por atraso desc; nova ordenação exposta para a lista completa.
- `src/pages/dp/cadastros/DpCadastroPendenciasLista.tsx`: aplicar ordenação por `atrasoDias` desc antes de renderizar.
- `src/components/dp/documentos/DocConsistenciaPanel.tsx`: inverter o comparador de `competencia` nos grupos e nos avisos.
- Testes: casos em `src/lib/dp/__tests__` para "falta parcial gera item por colaborador", "falta total gera item da unidade" e ordenação por atraso. Sem migração de banco.
