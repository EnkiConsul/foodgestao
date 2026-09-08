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
   Os cards de colaborador exibem hoje o selo "Folha: Sim" ou "Folha: Não". Como folha e ponto não são gerados pelo sistema (vêm da contabilidade), o selo sai dos cards.

## Detalhes técnicos

- Arquivo: `src/pages/dp/DpColaboradores.tsx` (apenas apresentação; sem mudanças de banco).
- Renderizar o bloco de `Tabs` de `statusFilter` fora da condição `origem === "colaboradores"`, ocultando o gatilho "Incompletos" quando `origem !== "colaboradores"`.
- Aplicar `statusFilter` em `pessoasApoioVisiveis` (via `p.ativo`) e em `todosVisiveis` (via `c.ativo` / `p.ativo`); "incompletos" filtra apenas itens do tipo colaborador.
- Em `todosVisiveis`, ordenar por grupo (`ativo ? 0 : 1`) e depois `nome.localeCompare(..., "pt-BR")`.
- Extrair o trecho de selos Ativo/Desligado (com `fmtDate(c.data_desligamento)`) em um helper local e usá-lo nos cards/linhas da aba Todos e nas listas de apoio.
- Reutilizar o mesmo array de ações da aba Colaboradores para as linhas/cards de colaborador na aba Todos.
