# Trocas de folga: cartão com detalhes e filtros no topo

Deixar a lista de trocas mais informativa e fácil de navegar, principalmente no celular.

## Cartão clicável com detalhes

Cada troca continua como um cartão na lista, agora com as informações essenciais já visíveis:

- Nome, cargo e unidade de cada colaborador envolvido
- As duas datas com o dia da semana ("Seg, 14/09" ↔ "Sáb, 19/09")
- Situação da troca e quem está esperando resposta

Tocar no cartão abre uma tela de detalhes (folha inferior no celular, janela no computador) com:

- Os dois colaboradores lado a lado: nome, cargo, unidade e matrícula
- Datas completas com dia da semana e quem folga em cada uma depois da troca
- Motivo completo do pedido
- Linha do tempo: pedido feito, resposta do colega (com data e justificativa), decisão do gestor (com data e justificativa)
- Regra da unidade em vigor: troca direta entre colegas ou com aprovação do gestor
- Os botões de Aprovar / Recusar / Cancelar, com as mesmas regras de hoje

No celular o cartão fica em uma coluna, com toque em qualquer área abrindo os detalhes; os botões de ação continuam acessíveis direto no cartão para não obrigar a abrir a tela.

## Filtros no topo

Barra de filtros padrão do módulo (busca sempre visível; no celular os demais campos ficam no botão "Filtros" com contador):

- Busca por nome do colaborador (solicitante ou colega) e por matrícula
- Unidade
- Cargo
- Situação da troca (as opções de hoje, incluindo Expiradas)
- Período das datas envolvidas (mês atual, próximo mês, intervalo personalizado)
- Sugestões extras: "Somente pendentes de ação minha" (atalho para o que espera o gestor) e ordenação por mais recentes / data da folga mais próxima

Um botão "Limpar filtros" e um resumo "X trocas" acima da lista.

## Detalhes técnicos

- `useDpTrocas.tsx`: ampliar o select para `solicitante:solicitante_id(nome, matricula, unidade_id, cargo_id, cargo:cargo_id(nome), unidade:unidade_id(nome))` e o mesmo para `destino`; tipar em `DpTrocaRow` sem `as any`. O modo por unidade passa a considerar a unidade do destinatário como hoje.
- Filtragem em memória no hook (a lista é por empresa e pequena): novo parâmetro de filtros `{ status, unidadeId, cargoId, busca, periodo, pendentesGestor, ordem }` com um helper puro em `src/lib/dp/trocas-filtros.ts` para poder testar.
- Nova UI: `src/components/dp/TrocaCard.tsx` (cartão clicável) e `src/components/dp/TrocaDetalheDialog.tsx` (usando `DpDialogShell`/`Sheet` conforme o padrão do módulo). `DpTrocas.tsx` passa a usar `DpFilters` + `DpFilterField` e os cartões.
- Dia da semana com `date-fns` + locale ptBR (`EEEEEE, dd/MM`), sem novas dependências.
- Unidades e cargos dos selects via hooks existentes (`useDpUnidades` / cargos em `useDpCadastros`).
- Testes unitários do helper de filtros e ordenação em `src/test/unit/trocasFiltros.test.ts`; ao final typecheck, lint e vitest.
- Sem mudanças de banco e sem alterar as regras de aprovação/recusa/cancelamento.
