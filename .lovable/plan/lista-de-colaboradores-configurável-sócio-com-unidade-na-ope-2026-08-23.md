# Lista de colaboradores configurável + sócio com unidade na Operação

## 1. Colunas da lista de colaboradores (como no Histórico de Documentos)

A lista de colaboradores (desktop) passa a ter o mesmo comportamento de planilha já existente no Histórico de Documentos:

- Arrastar o título para **reordenar** colunas.
- Alça na borda direita para **redimensionar** (duplo clique volta ao padrão).
- Menu no título com **Ordenar Crescente/Decrescente** e **filtro por valores** (busca, marcar/desmarcar, Selecionar Todos, Limpar).
- Ordem, larguras, ordenação e filtros ficam salvos no navegador do usuário.

Colunas: Colaborador, Cargo, Unidade, Status, Perfil (+ Ações, fixa à direita). Os filtros do topo da tela e a versão mobile em cards continuam como estão.

Para isso, o cabeçalho hoje escrito dentro da tela de Histórico é extraído para um componente compartilhado, sem mudar o comportamento da tela de Histórico.

## 2. Sócio: unidade "Geral" ou unidade específica

No cadastro do colaborador, quando o vínculo é **Sócio**:

- O campo Unidade ganha a opção **Geral (todas as unidades)** e deixa de ser obrigatório — "Geral" grava sem unidade.
- Se o sócio tiver uma unidade específica, ele passa a ser tratado como parte do quadro daquela unidade.

Efeito na Operação:

- Sócio **com unidade e com horário de trabalho cadastrado**: entra nas contagens normais do dia (Fixos Escalados quando trabalha, Folga Padrão no dia de folga da jornada dele), aparecendo nos blocos por período/cargo com a tag de sócio.
- Sócio **em Geral** ou **sem horário cadastrado**: continua fora das contagens CLT e aparece apenas no card **Folga Sócio** quando marcar folga ou férias.
- Folga extra e férias marcadas por qualquer sócio continuam contando no card **Folga Sócio** (não em Folga Extra/Férias), preservando a regra atual de que sócio não tem obrigação CLT.

## 3. Ausentes visíveis na Operação, com tag de sócio

Nas listas de ausentes do dia (detalhe dos cards e blocos por período), o sócio ausente volta a ser exibido junto dos demais, com a tag **Folga sócio** ao lado do nome, sem alterar os números dos cards de folga/férias. O card Folga Sócio segue mostrando o total e a lista de sócios ausentes.

## Detalhes técnicos

- Novo `src/components/dp/DpTableColumnHeader.tsx` (cabeçalho arrastável/redimensionável com menu de ordenação e filtro) e `src/hooks/useDpTableColumns.tsx` (ordem, largura, sort e filtros com persistência em localStorage por chave de tela). `DpHistoricoCompleto.tsx` passa a consumir os dois; `DpColaboradores.tsx` adota o mesmo padrão com chaves próprias (`dp_colabs_col_*`).
- `ColaboradorFormDialog.tsx`: sentinela `"geral"` no Select de Unidade quando `socioSelecionado`, gravando `unidade_id: null`; validação de obrigatoriedade e gates de progresso passam a aceitar sócio sem unidade.
- `src/lib/dp/operacao-panorama.ts`: a exclusão de sócio das contagens (`ausenciaDeSocio`) passa a valer somente quando o sócio não tem unidade ou não tem `config` de jornada; `PessoaPanorama` ganha o flag para a UI distinguir "sócio integrado ao quadro" de "sócio fora do quadro".
- `DpOperacaoPanorama.tsx`: remove o filtro que escondia sócios das listas de categoria e exibe a tag "Folga sócio"; card Folga Sócio e destaque no calendário continuam baseados nos sócios ausentes.
- Testes em `src/lib/dp/__tests__` cobrindo sócio com unidade + jornada (conta como fixo/folga padrão) e sócio Geral (só Folga Sócio).
