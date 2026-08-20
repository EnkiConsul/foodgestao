# Nova unidade em branco + exclusão com justificativa e lixeira de colaboradores

## 1. "Nova unidade" abre realmente vazia

Hoje, ao abrir "Nova unidade", o formulário busca os dados da empresa (nome fantasia, CNPJ, endereço, cidade, UF, telefone) e preenche tudo automaticamente — por isso parece que veio uma unidade já cadastrada.

- O cadastro passa a abrir em branco (só a empresa vinculada continua pré-selecionada quando existe uma única empresa).
- No lugar do preenchimento automático, entra o botão **Usar dados da empresa**, que preenche os campos quando o usuário quiser (mantendo a consulta por CNPJ/BrasilAPI que já existe).
- Edição de unidade continua igual: carrega os dados da própria unidade.

## 2. Exclusão de colaborador com justificativa obrigatória

- O botão de lixeira no cadastro do colaborador (e a exclusão na lista) passa a abrir um diálogo pedindo o motivo (mínimo de caracteres, obrigatório).
- A exclusão deixa de apagar o registro: ele é marcado como excluído, sai de todas as telas e listas do DP, e o motivo/autor/data ficam registrados no histórico de auditoria.
- Colaborador excluído não aparece em escalas, folha, portal, seletores nem contagens.

## 3. Lixeira com restauração (7 dias)

- Nova tela **Lixeira** dentro de Pessoas, listando colaboradores excluídos com nome, cargo, unidade, quem excluiu, motivo e quanto tempo resta.
- Ações: **Restaurar** (volta ao estado anterior, mantendo desligamento se havia) e **Excluir definitivamente** (com confirmação e nova justificativa).
- Acesso: admin/dono da empresa e super admin.
- Retenção de 7 dias: passado o prazo o item é purgado definitivamente e o registro fica só na auditoria.

## Detalhes técnicos

- `src/components/dp/UnidadeFormDialog.tsx`: remove a chamada automática de `applyCompanyData` na abertura em modo criação; mantém a função ligada a um botão explícito e à troca manual de empresa.
- Migração: colunas `deleted_at timestamptz`, `deleted_by uuid`, `delete_reason text` em `dp_colaboradores`, índice parcial por `company_id` para a lixeira, e ajuste das políticas/RLS de leitura para excluir registros com `deleted_at not null` no fluxo normal.
- Novas funções SECURITY DEFINER: `dp_excluir_colaborador(p_id, p_motivo)` (soft delete + `audit_logs`), `dp_restaurar_colaborador(p_id)` e `dp_purgar_colaborador(p_id, p_motivo)`; a purga por prazo usa a mesma função com filtro de 7 dias (chamada sob demanda ao abrir a lixeira, sem depender de agendador).
- Hooks: `useDeleteDpColaborador` passa a chamar a RPC com motivo; novos `useDpColaboradoresLixeira`, `useRestaurarDpColaborador`, `usePurgarDpColaborador` em `src/hooks/useDpColaboradores.tsx`.
- UI: reaproveita `RecusaDialog`-like para capturar motivo (novo `MotivoDialog` genérico), nova página `src/pages/dp/DpColaboradoresLixeira.tsx`, rota `/dp/colaboradores/lixeira` e item em `dpNavigation.tsx` visível conforme permissão.
- Consultas existentes de `dp_colaboradores` no app recebem o filtro `is('deleted_at', null)` (revisão em `src/hooks/useDp*`), evitando que excluídos reapareçam.
