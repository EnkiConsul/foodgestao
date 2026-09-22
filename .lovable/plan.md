# Três ajustes: menu de Cadastro, cargo do sócio e ASO separado

## 1. Regras de Folgas fora do menu de Cadastro

A tela de Cadastro traz um atalho extra para "Regras de Folgas", que pertence ao menu de Folgas. Esse atalho sai do Cadastro; a tela continua existindo e acessível pelo menu de Folgas, sem mudar nenhuma regra cadastrada.

## 2. Cargo vazio na ficha do sócio

A ficha do colaborador lista os cargos da empresa sem filtrar por unidade, e a empresa tem cinco cargos cadastrados (ATENDENTE, AUXILIAR DE SERVIÇOS DE ALIMENTAÇÃO, MOTOQUEIRO, PIZZAIOLO e SÓCIO). Portanto a lista vazia é uma falha silenciosa ao carregar, não ausência de cargos — a causa exata ainda não está comprovada, então o primeiro passo é fazer a falha aparecer.

O campo Cargo passa a se comportar como já corrigimos no link de admissão:

- Enquanto carrega, mostra "Carregando cargos…".
- Se a leitura falhar, mostra o aviso com o botão "Tentar De Novo" e registra o erro para diagnóstico.
- Nunca abre uma lista vazia em silêncio: sem nenhum cargo cadastrado, explica que é preciso cadastrar um cargo e oferece o botão "Novo cargo" que já existe.

Além disso, nas listas de cargo filtradas por unidade, os cargos de sócio passam a aparecer sempre, mesmo sem vínculo com unidade (hoje SÓCIO não está vinculado a nenhuma unidade).

## 3. ASO admissional e demissional separados

Hoje o ASO está dentro dos tipos "Admissão" e "Desligamento". Como o exame é feito em data própria, ele ganha tipo próprio:

- Novos tipos: "ASO Admissional" (grupo Admissão) e "ASO Demissional" (grupo Desligamento), com data própria e disponíveis na importação, no envio pelo portal e nos filtros.
- As palavras-chave de ASO saem de Admissão e Desligamento e passam para os novos tipos, então a detecção automática por nome do arquivo já classifica certo.
- Documentos de ASO já importados dentro de Admissão/Desligamento continuam onde estão, com o mesmo histórico e os mesmos aceites. Nada é reclassificado nem movido.
- Nas pendências continuam existindo apenas duas cobranças: documento de admissão e documento de desligamento. O ASO não gera pendência própria e também não serve para quitar a pendência de admissão ou de desligamento.

## Detalhes técnicos

- `src/pages/dp/DpCadastrosHub.tsx`: remover o `extras` com `/dp/folgas?aba=regras` (e o import de `Scale`).
- `src/components/dp/ColaboradorFormDialog.tsx`: usar `isLoading`/`isError`/`refetch` de `useDpCargos` no bloco do campo Cargo, com aviso + "Tentar De Novo" e `reportError` silencioso (mesmo padrão de `PreadmissaoConviteDialog`).
- `src/lib/dp/cargos-unidade.ts`: `listaCargosDaUnidade` passa a sempre incluir cargos de sócio (nome reconhecido por `cargoSugereVinculoSocio`) independentemente de `dp_unidade_cargos`; testes novos em `__tests__/cargos-unidade.test.ts`.
- Migration isolada: `ALTER TYPE dp_documento_tipo ADD VALUE 'aso_admissional'` e `'aso_demissional'` (aditiva, sem tocar em registros existentes).
- `src/lib/dp/documentoTipos.ts`: dois novos `DpDocTipoDef` importáveis, palavras-chave de ASO movidas para eles, incluídos em `detectarTipoDocumento` antes de `admissao`/`desligamento`; espelhar em `supabase/functions/_shared/doc-tipos.ts`.
- `src/lib/dp/pendencias-documentos.ts`, `src/lib/dp/bulk-coverage.ts` e `src/hooks/useDpPendencias.tsx`: os novos tipos não entram na cobertura de admissão/desligamento nem geram pendência.
- Validação: `bunx vitest run`, `bunx tsgo --noEmit -p tsconfig.app.json`, ESLint. Nada publicado.
