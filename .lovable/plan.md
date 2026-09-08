# Filtro de ativos/desligados em todas as abas de Colaboradores

## O que muda

1. **Filtro de situação em todas as abas**
   As opções "Todos / Ativos / Desligados / Incompletos" hoje aparecem só na aba Colaboradores. Passam a aparecer também em Todos, Folguistas e Em Teste.
   - Em Folguistas / Em Teste / Todos, a opção "Incompletos" continua valendo apenas para colaboradores (folguistas e pessoas em teste não têm esse selo), então nessas abas ela some e a contagem considera só colaboradores.
   - Folguistas e pessoas em teste inativas entram em "Desligados" (rótulo "Inativo" no selo, como já é hoje).

2. **Desligados sempre no fim da lista**
   Na aba Todos, a ordenação passa a ser: ativos primeiro (em ordem alfabética), depois desligados/inativos (também em ordem alfabética). Igual ao comportamento da aba Colaboradores.

3. **Selo de situação de volta na aba Todos**
   Cada pessoa na aba Todos volta a mostrar o selo verde "Ativo" ou o selo vermelho "Desligado" com a data, além do selo de origem (Colaborador / Folguista / Em Teste). No celular o selo aparece no card; no computador, na coluna Situação.

4. **Ações completas na aba Todos**
   Hoje, na aba Todos, o colaborador só tem "Editar". Passa a ter as mesmas ações da aba Colaboradores: editar, acesso ao portal, registrar desligamento ou reintegração, alterar condições de trabalho e remover.

5. **Remover o selo "Folha: Sim/Não" dos cards**
   Os cards de colaborador exibem hoje o selo "Folha: Sim" ou "Folha: Não". Como folha e ponto não são gerados pelo sistema (vêm da contabilidade), o selo sai dos cards. Caso se opte por mantê-lo, ele deve ser renomeado para "Ponto: Sim/Não" para não confundir com folha de pagamento.

6. **Lixeira fora do menu de 3 pontos**
   O atalho "Lixeira" hoje fica dentro do menu de ações ao lado do botão "Novo colaborador". Ele passa a ser um botão à parte, com ícone de lixeira sem tampa (para não parecer o mesmo botão de "Excluir" de um cadastro).

7. **Ver abre visualização nos apoios**
   Hoje, ao clicar em "Ver" em um card de Folguista ou Em Teste, o sistema abre a edição. Passa a abrir o card de visualização primeiro, igual ao comportamento dos colaboradores. A edição fica acessível pelo menu de ações do card.

## Detalhes técnicos

- Arquivo: `src/pages/dp/DpColaboradores.tsx` (apenas apresentação; sem mudanças de banco).
- Renderizar o bloco de `Tabs` de `statusFilter` fora da condição `origem === "colaboradores"`, ocultando o gatilho "Incompletos" quando `origem !== "colaboradores"`.
- Aplicar `statusFilter` em `pessoasApoioVisiveis` (via `p.ativo`) e em `todosVisiveis` (via `c.ativo` / `p.ativo`); "incompletos" filtra apenas itens do tipo colaborador.
- Em `todosVisiveis`, ordenar por grupo (`ativo ? 0 : 1`) e depois `nome.localeCompare(..., "pt-BR")`.
- Extrair o trecho de selos Ativo/Desligado (com `fmtDate(c.data_desligamento)`) em um helper local e usá-lo nos cards/linhas da aba Todos e nas listas de apoio.
- Reutilizar o mesmo array de ações da aba Colaboradores para as linhas/cards de colaborador na aba Todos.
- No `DpPageHeader`, mover o item "Lixeira" do menu de ações para um botão secundário ao lado do botão principal, usando um ícone de lixeira sem tampa (ex.: `Trash` do `lucide-react` ou outro que represente a lixeira em vez de exclusão imediata).
- Para Folguistas e Em Teste, o `onOpen` do `DpListCard` e o clique na linha da tabela abrem a visualização (`ApoioViewDialog` ou o equivalente usado para colaboradores); a ação "Editar cadastro" abre o formulário de edição. Se a visualização não existir, começar com o card de leitura simples e abrir edição apenas pelo menu.
