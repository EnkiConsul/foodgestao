## Objetivo

A pendência "Contracheque não fechado" no widget de Pendências abre `/dp/folha`, página que não existe no projeto original (Pakere) e não deve fazer parte do 360°FOOD. Redirecionar cada pendência para a página de documentos correta e remover `/dp/folha` do projeto.

## Alterações

### 1. `src/hooks/useDpPendencias.tsx`
- Pendência **Contracheque não fechado** (linha 145): `url: "/dp/folha"` → `url: "/dp/documentos/contracheque"`.
- Pendência **Adiantamento não fechado** (linha 183): `url: "/dp/folha"` → `url: "/dp/documentos/adiantamento"`.

### 2. `src/App.tsx` — remover rotas e imports órfãos
- Remover imports lazy (linhas 72–74): `DpFolhaHub`, `DpFolhaPeriodo`, `DpFolhaAprovacoes`.
- Remover rotas (linhas 363–366): `folha`, `folha/aprovacoes`, `folha/periodos/:id`.

### 3. Excluir arquivos das páginas removidas
- `src/pages/dp/DpFolhaHub.tsx`
- `src/pages/dp/DpFolhaPeriodo.tsx`
- `src/pages/dp/DpFolhaAprovacoes.tsx`

### 4. `src/components/dp/favoritablePages.ts`
- Remover entradas que referenciam `/dp/folha*` para não deixar favoritos apontando para rota inexistente.

### 5. Menu / sidebar do DP
- Verificar `DpSidebar` (e demais menus do módulo DP) e remover qualquer item que aponte para `/dp/folha`, se existir.

## Fora de escopo

- Não altero a lógica de detecção das pendências (regras de vencimento, leitura de `dp_folha_periodos`) — só o destino do botão "Resolver" e a remoção da página órfã.
- A tabela `dp_folha_periodos` continua sendo usada para saber se contracheque/adiantamento foi fechado.
