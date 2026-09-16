# Correções da auditoria Open Finance / Conciliação

Confirmei no estado atual que os problemas apontados continuam válidos:

- As funções de confirmação exigem apenas "ser membro da empresa" (`company_members`), não permissão de edição; a regra de acesso da fila de conferência (`pluggy_staging_member_all`) libera escrita a qualquer membro, incluindo quem só deveria consultar.
- Existem duas versões da função de confirmação com a mesma chamada possível (uma antiga, sem rastreio Pluggy e sem forma de pagamento/contato) — chamada ambígua e risco de gravar sem rastreabilidade.
- Nenhum caminho de confirmação bloqueia a linha da fila antes de gravar; duas confirmações simultâneas podem duplicar lançamento.
- Na tela, a confirmação em lote avisa "concluído" mesmo quando parte falhou.
- Três linhas estão como "conferida" sem lançamento vinculado (duas da PRAIANOS, uma da Familia) — registradas para investigação, sem alteração.

Como é muita coisa e mexe em dinheiro, proponho executar em 5 fases, uma por vez, com sua aprovação entre elas. Nada é publicado, nenhum banco é reconectado e nenhum lançamento real é confirmado.

## Fase 1 — Permissão e escopo (banco)

- Trocar "é membro" por "é dono ou tem permissão de edição no financeiro" em todas as funções de confirmação (normal, cartão, transferência, rateio) e também em ignorar/marcar duplicado.
- Separar a regra da fila de conferência: leitura para quem pode ver o financeiro; gravação só para dono/editor.
- Validar em todas elas que conta, cartão, categoria, forma de pagamento e contato pertencem à mesma empresa e estão ativos.
- Remover a versão antiga e ambígua da função de confirmação, mantendo compatibilidade com quem a chama hoje (a tela passa a chamar sempre a versão completa).

## Fase 2 — Confirmação segura (banco)

- Bloquear cada linha da fila antes de gravar e reler o estado depois do bloqueio, em todos os caminhos (normal, cartão, transferência, rateio).
- Confirmar duas vezes a mesma linha devolve o lançamento já existente, sem duplicar, preservando o rateio e o espelho de auditoria.
- Transferência entre contas da empresa deixa de falhar só porque a conta foi cadastrada por outra pessoa da mesma empresa; as verificações do contexto pessoal continuam iguais.
- Rastreio Pluggy (identificador de origem e cópia do dado original) obrigatório em todos os caminhos.

## Fase 3 — Tela de conferência

- A confirmação em lote passa a devolver o que realmente foi gravado: quantos confirmaram, quantos falharam e quantos foram bloqueados por permissão.
- Mensagem de sucesso só aparece para o que confirmou; o que falhou continua selecionado para nova tentativa.
- Nenhuma mensagem de "concluído" após erro ou retorno antecipado.

## Fase 4 — Sincronização e rotina automática

- Erros de gravação e de atualização de saldo deixam de ser ignorados: contadores passam a refletir o real.
- "Materializado" só fica verdadeiro quando de fato materializou; data de conclusão só depois de gravar.
- A rotina automática e o processador de avisos passam a ler o resultado real (parcial, erro, pendente) em vez de considerar sucesso só porque a chamada respondeu.
- Quando o banco corrige valor, data ou tipo de um lançamento ainda pendente, a fila é atualizada; o que já foi conferido e as decisões da pessoa são preservados.

## Fase 5 — Avisos do banco, revogação e extrato

- Nova autorização legítima deixa de ser descartada quando a conexão ainda não existe no cadastro; a empresa é resolvida pela solicitação validada, nunca por adivinhação.
- Conflito claro entre duas empresas passa a aguardar revisão em vez de repetir cinco vezes.
- A identidade da conta passa a considerar banco, agência, titular e tipo — não só o número mascarado — mantendo contas e saldos independentes por empresa; herança não apaga histórico já conferido.
- Desconectar com erro no banco é comunicado como "pendente", nunca como "revogado com sucesso".
- Coleta parcial passa a informar o detalhe por produto em vez de dizer sempre que faltam contas.
- No extrato, duplicidade por versão/espelho deixa de ser confundida com divergência real de valor; divergência real entra na lista.

## Testes

Cada fase entrega testes focados de verdade (sem simulações que só repitam o código): acesso negado para quem só consulta, duas confirmações ao mesmo tempo, rateio, falha parcial em lote, conexão nova sem retorno do navegador e correção de lançamento pela origem.

## As três linhas conferidas sem lançamento

Plano de recuperação, sem tocar nos dados agora: conferir no histórico de auditoria e no rastreio de origem se existe lançamento equivalente já gravado (mesmo identificador de origem, valor e data). Havendo lançamento, apenas religar o vínculo; não havendo, devolver a linha para a fila e deixar a pessoa conferir. Qualquer um dos dois passos só depois da sua autorização explícita, empresa por empresa.

## Detalhes técnicos

- Banco: `pluggy_confirm_staging` (remover sobrecarga de 3 argumentos), `pluggy_confirm_staging_card`, `pluggy_confirm_staging_transfer` (2 sobrecargas), `pluggy_confirm_staging_split`, `pluggy_ignore_staging`, `pluggy_mark_duplicate_staging`, `pluggy_inherit_staging`; guarda por `private.is_company_owner` OR `private.member_can_edit(uid, company, 'financeiro')`; `SELECT ... FOR UPDATE` + releitura de `status='pending'`; políticas de `pluggy_staging_transactions` separadas em leitura/escrita.
- Edge Functions: `pluggy-connect-token` (exigir edição; `probe` só super admin; validar `item_id` pertencente à empresa), `pluggy-sync-item` (exigir edição; contadores e flags reais), `pluggy-disconnect-item` (exigir edição; `pluggy_account_id` obrigatoriamente da conexão autorizada; erro remoto → pendente), `pluggy-cron-sync` (ler corpo/status real), `pluggy-webhook` + worker (resolução por solicitação validada, conflito → revisão).
- Frontend: `src/pages/ConciliacaoPluggy.tsx` (`confirmIds`/`confirmSelected` com resultado estruturado), `src/lib/pluggy/syncOutcome.ts`, `src/lib/conciliacao/extrato.ts`, `src/hooks/useExtratoConciliacao.tsx`.
- Testes em `src/test/unit`, `src/test/rls` e `supabase/tests`.
