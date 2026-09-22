# F02 — baixas parciais, concorrência e estorno

## Estado da entrega
Implementação na branch `codex/f02-baixas-atomicas`, baseada em F01 (`8705b5b`). Banco aplicado e testado apenas em homologação (`utjhzpdbqzajrhnzcher`). Interface implementada e compilada localmente, sem publicação. Produção permaneceu somente leitura.

## Antes e depois
Uma despesa de R$ 100 com baixa de R$ 40 continuava pendente e não movimentava saldo. O cliente calculava o acumulado usando o valor da tela; duas sessões podiam perder uma baixa. Uma edição cadastral também podia zerar amount_paid.

Agora títulos bancários pendentes usam transaction_payments, com valor, data, conta, autor, método, chave de idempotência e referência de estorno. record_transaction_payment bloqueia o título com FOR UPDATE, verifica autorização e origem financeira, consulta o restante atual e grava histórico, saldo e resumo do título na mesma transação. Repetir uma chave e os mesmos dados retorna o recibo sem repetir a movimentação; reutilizar a chave com outros dados falha. Duas chaves distintas não podem ultrapassar o título.

O título é apenas o resumo das baixas; apply_tx_balance não movimenta novamente seu valor integral. A recomposição e a detecção de divergência somam lançamentos legados e movimentos do histórico, sem dupla contagem. A sincronização bancária adquire o mesmo lock de conta antes de decidir se pode inicializar saldo.

Estornos geram outro registro, com motivo e data, sem apagar o original. Só é permitido um estorno por pagamento. Não é permitido cancelar um título com valor pago; primeiro é necessário estornar. Títulos com histórico não podem ser excluídos, mesmo após estorno. Podem ser cancelados, preservando os registros.

Edições cadastrais omitem valores/datas/status de pagamento que vieram da tela. O banco também impede adulteração do resumo. Para títulos geridos pelo histórico, a edição de status/data é feita pela tela de pagamentos/estornos. Atalhos de status abrem essa tela.

## Escopo de compatibilidade
- Títulos pendentes com origem em conta bancária são convertidos; novos pendentes desse tipo entram automaticamente no histórico.
- Lançamentos confirmados legados, compras no cartão, transferências e pagamentos de fatura mantêm seus fluxos existentes. Não foram inventadas datas ou parcelas históricas para converter registros já confirmados.
- Confirmados legados não podem ser transformados diretamente em baixas parciais sem histórico. A operação falha e orienta cancelar/recriar o título pendente. Alterações que tornem o valor pago legado um parcial também falham.
- A migração aborta se encontrar pendentes bancários com amount_paid diferente de zero. Nesses casos é necessária conciliação histórica antes da instalação.
- Última consulta de produção: 65 confirmados e 72 pendentes bancários, sem baixas parciais armazenadas. Isso não prova que nunca houve perda de informação anterior.
- A interface permite escolher uma conta da mesma empresa/contexto em cada baixa. PF exige propriedade pessoal. Permissão de edição de transactions é verificada em toda operação, inclusive repetição e estorno.
- O saldo usa a data da baixa/estorno e respeita reference_balance_date na conta.
- Esta entrega não converte todos os relatórios analíticos/DRE/extratos por período para eventos de caixa. Relatórios que ainda derivam realizado apenas de status/amount do título precisam de revisão antes de uma certificação financeira completa.
- Não é certificação de capacidade para 50 empresas.

## Validação
- 31/31 testes REST com autenticações sintéticas reais: R$ 40 de baixa, descrição preservada, 30+30 simultâneos, excesso concorrente, mesma chave simultânea, replay, estorno/replay/estorno duplicado, leitura/escrita indevida, PF/PJ, conta de outra empresa, valores inválidos e caminho legado.
- 5/5 verificações SQL com rollback: recomposição parcial, ausência de falsa divergência, sincronização bancária preservando saldo, recomposição após estorno, histórico imutável mesmo por edição privilegiada.
- 4/4 testes da interface: RPC com valor incremental, repetição após falha de conexão e reabertura, bloqueio de duplo envio, preservação de tentativa incerta quando os dados são alterados.
- `tsc --noEmit -p tsconfig.app.json`: passou.
- `npm run build`: passou. Avisos de chunks grandes/Tailwind/importação dinâmica; security-lint de prebuild foi ignorado pelo script por ausência de psql. As verificações do banco foram feitas por REST/SQL e advisors.
- Dependências locais existentes foram reutilizadas por junction; não se afirma instalação limpa via npm ci ou passagem do CI completo.
- Advisors: nenhum aviso de segurança relacionado às novas funções/tabela. Dois índices de FKs ainda não usados na amostra aparecem como INFO; foram mantidos para cobertura das referências. Outros alertas gerais anteriores permanecem. [Documentação dos advisors](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
- Todos os pagamentos sintéticos REST foram estornados e títulos com histórico foram cancelados. O histórico permanece em homologação para auditoria. Saldos das contas sintéticas retornaram a zero. Testes SQL foram integralmente revertidos.

Os dois testes iniciais de recomposição por REST falharam por ACL: essas RPCs são privadas para o cliente. A expectativa foi corrigida para verificar a negação, e o comportamento de recomposição foi validado por SQL privilegiado, sem ampliar permissões.

## Arquivos e execução
- Migrações: 20260922030010_f02_atomic_payments.sql, 20260922164415_f02_guard_legacy_partial.sql, 20260922164911_f02_lock_bank_sync.sql.
- `node docs/security/f02/test-rest.mjs`: exige fixtures F01 e credenciais sintéticas locais. Referência e URL são verificadas antes de qualquer requisição. Não executar contra produção.
- `test-privileged.sql`: somente homologação com fixtures identificadas; alterações são revertidas.
- `node node_modules/vitest/vitest.mjs run src/components/bills/PaymentDialog.test.tsx`.
- Resultados em rest-results.json, privileged-results.json, production-preflight.json e advisors-summary.json.

## Implantação e limitações
Implantar F01 primeiro, depois as três migrações F02 em ordem, reconciliando versões já aplicadas em homologação com o histórico remoto. Cada migração deve ser transacional. A migração principal bloqueia escrita temporariamente nas tabelas envolvidas e espera no máximo 5 segundos pelos locks.

Coordenar banco e frontend numa janela de manutenção dos pagamentos. Clientes com a versão antiga terão updates de baixa rejeitados pelo banco; precisam carregar a nova versão. Não fazer downgrade que ignore o histórico depois que houver pagamentos reais: isso cria dupla contagem ou perda de saldo. Não remover guards para contornar rejeições.

Frontend ainda não foi publicado, não houve implantação em produção nem revisão visual em navegador. As provas de interface são testes de componente e compilação. Estorno integral por registro foi implementado; estorno de parte de uma única baixa não faz parte deste fluxo.

Referências de implementação: [funções Supabase](https://supabase.com/docs/guides/database/functions) e [locks PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html).
