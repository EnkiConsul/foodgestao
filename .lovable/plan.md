# Três ajustes: menu de Cadastro, listas de cargo e ASO separado

## 1. Regras de Folgas fora do menu de Cadastro

A tela de Cadastro traz um atalho extra para "Regras de Folgas", que pertence ao menu de Folgas. Esse atalho sai do Cadastro; a tela continua existindo e acessível pelo menu de Folgas, sem mudar nenhuma regra cadastrada.

## 2. Lista de cargos vazia — revisão em todo o sistema

A empresa tem cinco cargos cadastrados (ATENDENTE, AUXILIAR DE SERVIÇOS DE ALIMENTAÇÃO, MOTOQUEIRO, PIZZAIOLO e SÓCIO), então lista vazia é falha ao carregar, não ausência de cargo. A causa exata ainda não está comprovada — o primeiro passo é fazer a falha aparecer em vez de sumir.

Correção em todas as telas que oferecem cargo, não só na ficha do sócio:

- Enquanto carrega, o campo mostra "Carregando cargos…" no lugar de uma lista vazia.
- Se a leitura falhar, aparece o aviso com o botão "Tentar De Novo", e o erro fica registrado para diagnóstico.
- Só quando realmente não existe cargo cadastrado é que a mensagem diz isso, indicando cadastrar o cargo.
- A contagem de pessoas por cargo deixa de derrubar a lista: se ela falhar, os cargos continuam aparecendo.
- Nas listas filtradas por unidade, cargos de sócio aparecem sempre, mesmo sem vínculo com unidade (hoje SÓCIO não está vinculado a nenhuma unidade).

Telas revisadas: ficha do colaborador, recontratação, alteração de condições, pessoa de apoio, novo colaborador pelos documentos, convite e revisão de pré-admissão, regras de admissão, requisitos e complementos do cargo, enquadramento sindical, atuação em outras unidades e os filtros de cargo das telas de Colaboradores, Cargos e Benefícios.

## 3. ASO admissional e demissional separados

Hoje o ASO está dentro dos tipos "Admissão" e "Desligamento". Como o exame é feito em data própria, ele ganha tipo próprio:

- Novos tipos: "ASO Admissional" (grupo Admissão) e "ASO Demissional" (grupo Desligamento), com data própria e disponíveis na importação, no envio pelo portal e nos filtros.
- As palavras-chave de ASO saem de Admissão e Desligamento e passam para os novos tipos, então a detecção automática por nome do arquivo já classifica certo.
- Documentos de ASO já importados dentro de Admissão/Desligamento continuam onde estão, com o mesmo histórico e os mesmos aceites. Nada é reclassificado nem movido.
- Nas pendências continuam existindo apenas duas cobranças: documento de admissão e documento de desligamento. O ASO não gera pendência própria e também não quita a pendência de admissão ou de desligamento.

## Detalhes técnicos

- `src/pages/dp/DpCadastrosHub.tsx`: remover o `extras` com `/dp/folgas?aba=regras` (e o import de `Scale`).
- `src/hooks/useDpCadastros.tsx`: em `useDpCargos`, isolar a contagem de colaboradores em try/catch (falha → contagem 0, lista preservada).
- Novo `src/components/dp/cargos/CargoSelectItems.tsx`: estados carregando / erro com "Tentar De Novo" / vazio, usado por todos os seletores listados acima, com `reportError` silencioso levando `companyId` e a tela de origem.
- `src/lib/dp/cargos-unidade.ts`: `listaCargosDaUnidade` sempre inclui cargos de sócio (`cargoSugereVinculoSocio`), independentemente de `dp_unidade_cargos`; testes em `__tests__/cargos-unidade.test.ts`.
- Migration isolada: `ALTER TYPE dp_documento_tipo ADD VALUE 'aso_admissional'` e `'aso_demissional'` (aditiva).
- `src/lib/dp/documentoTipos.ts`: dois novos `DpDocTipoDef` importáveis, palavras-chave de ASO movidas para eles e incluídos em `detectarTipoDocumento` antes de `admissao`/`desligamento`; espelhar em `supabase/functions/_shared/doc-tipos.ts`.
- `src/lib/dp/pendencias-documentos.ts`, `src/lib/dp/bulk-coverage.ts` e `src/hooks/useDpPendencias.tsx`: os novos tipos não entram na cobertura de admissão/desligamento nem geram pendência.
- Validação: `bunx vitest run`, `bunx tsgo --noEmit -p tsconfig.app.json`, ESLint. Nada publicado.
