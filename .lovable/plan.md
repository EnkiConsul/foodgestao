# Calendário de folgas: cancelar folga do dia e esconder quem não trabalha no dia

## O que está acontecendo hoje

Confirmei nos dados: a folga da Sara em 13/09 foi gravada como uma **solicitação já aprovada** (é assim que o botão "Atribuir" do dia grava). Na janela do dia, o botão de excluir só aparece para folgas que vieram do outro caminho (folgas efetivadas) — por isso não existe nenhuma forma de desfazer o que você atribuiu ali.

A lista "Atribuir folga manual" também mostra todos os colaboradores ativos da unidade, sem olhar se aquele dia da semana é dia de trabalho da pessoa.

## Mudanças

### 1. Cancelar a folga direto na janela do dia
- Cada pessoa listada em "Escala do dia" passa a ter a ação de cancelar, com uma confirmação curta ("Cancelar a folga de Sara em 13/09?").
- A folga sai do calendário mas **fica registrada como cancelada** no histórico, com quem cancelou e quando — nada é apagado.
- Vale para os dois tipos de registro: a folga atribuída pelo dia (solicitação aprovada) e a folga efetivada. Férias e atestados continuam sendo tratados pela aba de solicitações, não por aqui.
- A folga que vem da regra de folga fixa semanal do colaborador não tem botão de cancelar (ela não é um lançamento, é a escala dele); no lugar aparece uma explicação curta de que se muda na configuração de trabalho da pessoa.

### 2. Só oferecer folga a quem trabalha naquele dia
- A lista de colaboradores da atribuição do dia passa a excluir quem, na configuração de trabalho vigente naquela data, tem aquele dia da semana marcado como "não trabalha".
- Quando alguém é escondido por esse motivo, a janela mostra uma linha discreta explicando: "2 colaboradores não trabalham neste dia da semana e por isso não precisam de folga".
- Se ninguém da unidade trabalha naquele dia, o bloco de atribuição aparece com a mensagem em vez do campo de escolha.
- O mesmo filtro passa a valer no formulário de ausência avançada quando a data já está definida, para não gerar folga para quem já folga naquele dia.

## Notas técnicas

- `src/pages/dp/DpFolgas.tsx`: nova ação de cancelamento por evento; para solicitações, `status = 'cancelada'` (em vez de nada) e, para `dp_folgas`, trocar o `delete` atual pela função existente `dp_folga_cancelar_admin`, que cancela preservando o registro. Confirmação via `AlertDialog`.
- `src/hooks/useDpFolgasQueries.tsx`: nova consulta das configurações de trabalho vigentes da empresa (`dp_colaborador_config_trabalho` + `dp_colaborador_config_dias`, filtrando por `company_id` e vigência que cobre o mês), devolvendo um mapa colaborador → dias em que trabalha.
- Novo utilitário em `src/lib/dp/` com a função pura "trabalha neste dia?" (resolve a vigência da data e cai no padrão "trabalha" quando não há configuração), com testes unitários cobrindo: dia não trabalhado, colaborador sem configuração, e troca de vigência no meio do mês.
- Sem migração de banco: as colunas e a função de cancelamento já existem.
