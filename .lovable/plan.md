
# Desbloqueio com escopo explícito + visão consolidada em Datas Bloqueadas

Hoje, ao clicar em "Liberar Data" no calendário, o override é gravado com um escopo fixo, sem considerar se a regra de origem é global ou por unidade. Isso gera conflito: uma regra global pode ficar parcialmente liberada sem o admin perceber, e a lista de `/dp/bloqueios` não reflete overrides por unidade quando a regra é global.

## O que vai mudar

### 1. Diálogo de escopo ao liberar data

Ao clicar em **"Liberar Data"** no dia do calendário (tanto em `DpFolgas.tsx` quanto em `DpAdminCalendario.tsx`):

- Se a data vier de **regra por unidade** (ou bloqueio manual já com `unidade_id`): libera direto naquele escopo — sem diálogo.
- Se a data vier de **regra global** (sem unidades vinculadas): abre um `AlertDialog` novo perguntando:
  - **"Liberar apenas para [Unidade Atual]"** → grava override com `unidade_id = <ativa>`.
  - **"Liberar para todas as unidades"** → grava override com `unidade_id = NULL`.
  - Cancelar fecha sem fazer nada.
- Se o admin não estiver com uma unidade selecionada no contexto, esconde a opção "só para esta unidade" e explica no texto.

Componente novo: `src/components/dp/bloqueios/LiberarEscopoDialog.tsx`. Reaproveitado pelas duas páginas.

### 2. Motor de expansão: overrides parciais

Em `src/lib/dp/bloqueios.ts`, ao anotar `liberada` numa data expandida:

- Buscar **todos** os overrides daquela data (não só o do escopo consultado).
- Retornar, junto com a data, dois campos novos: `liberadaGlobal: boolean` e `unidadesLiberadas: string[]` (ids).
- Uma data global só é considerada "totalmente liberada" quando `liberadaGlobal = true` **ou** `unidadesLiberadas` cobre todas as unidades da empresa.

### 3. Lista `/dp/bloqueios`: badge de overrides parciais

Em `src/components/dp/bloqueios/DataRow.tsx`:

- Data com override global → segue como hoje: badge "Liberada" + botão "Bloquear Novamente".
- Data com override(s) só de unidade(s), regra ainda ativa para as demais → **uma única linha**, status "Bloqueada" + badge secundário **"Liberada em N unidade(s)"** com tooltip listando os nomes.
- Botão de ação vira um **menu** (`DropdownMenu`) com:
  - "Bloquear novamente em [Unidade X]" para cada override ativo.
  - "Liberar em outras unidades" (abre o mesmo diálogo do item 1, pré-filtrado).
- Data sem override permanece igual.

### 4. Enforcement no banco

O trigger `dp_regra_bloqueia_data` já consulta `dp_datas_bloqueadas` por `(company_id, unidade_id, data)`. Vou adicionar um teste na função para também respeitar override **global** (`unidade_id IS NULL`) mesmo quando a folga é solicitada com unidade específica — isso já é o comportamento hoje via `NULLS NOT DISTINCT`, mas quero confirmar com um `SELECT` antes de tocar; se estiver correto, esta etapa cai fora do plano.

## Detalhes técnicos

- Arquivos alterados: `src/lib/dp/bloqueios.ts`, `src/pages/dp/DpFolgas.tsx`, `src/pages/dp/DpAdminCalendario.tsx`, `src/pages/dp/DpBloqueios.tsx`, `src/components/dp/bloqueios/DataRow.tsx`.
- Arquivo novo: `src/components/dp/bloqueios/LiberarEscopoDialog.tsx`.
- Sem migração de schema (a constraint `UNIQUE NULLS NOT DISTINCT` já suporta os dois escopos). Antes de codar, rodo um `SELECT` rápido em `dp_datas_bloqueadas` + `dp_bloqueio_regras` do 08/08/2026 para validar o estado atual e confirmar que o trigger já cobre override global.
- Cache: mantém as chaves `['dp-bloqueios', ...]`, `['dp-datas-bloqueadas', ...]` e `['dp-folgas-mes', ...]` invalidadas em todos os pontos (já feito na rodada anterior).

## Fora de escopo

- Alterar a semântica de "excluir regra" (segue igual: apaga todas as datas expandidas).
- Overrides parciais de bloqueios manuais criados diretamente em `/dp/bloqueios` (fluxo de criação já pede unidade; sem ambiguidade).
