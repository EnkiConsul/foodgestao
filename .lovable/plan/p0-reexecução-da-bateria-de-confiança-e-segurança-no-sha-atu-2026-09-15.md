# P0 — Reexecução da bateria de confiança e segurança no SHA atual

Objetivo: rodar novamente, no código de hoje, as verificações de isolamento entre empresas do Financeiro, o portão de release e o fluxo completo de Open Finance, e produzir evidência objetiva de que (a) a empresa A nunca vê dados da empresa B e (b) saldo bancário e saldo contábil permanecem separados.

Nada de produto muda nesta fase: só execução, medição e correção do que reprovar.

## 1. Isolamento entre empresas (Financeiro)

- Rodar a suíte de isolamento existente (19 arquivos de regras de acesso + 3 de multiempresa) e registrar aprovados/ignorados.
- Rodar a varredura de políticas de acesso em massa no banco (credencial disponível) e comparar com a linha de base.
- Prova direta no banco, em transação com desfazimento: para contas, cartões, faturas, lançamentos, categorias, contatos e orçamentos, consultar como usuário da empresa A e confirmar zero linhas da empresa B; repetir invertendo os papéis. Também confirmar que o dono de uma empresa não alcança a outra.
- Registrar quais testes de multiempresa ficam ignorados por falta de credenciais de usuários de teste e o que isso deixa sem cobertura.

## 2. Separação entre saldo bancário e saldo contábil

- Confirmar no código e no banco que o valor vindo do banco fica em campo próprio da conta (com data e origem) e nunca sobrescreve o saldo calculado pelos lançamentos.
- Prova em transação com desfazimento: gravar um valor de banco diferente do saldo calculado em uma conta de teste e verificar que relatórios, painel e conciliação continuam usando o saldo dos lançamentos, exibindo o valor do banco apenas como comparação/diferença.
- Conferir que a diferença registrada entre os dois saldos é derivada e não altera nenhum dos dois.

## 3. Portão de release no SHA atual

- Executar o portão completo em modo tolerante e depois reportar etapa por etapa: tipos, lint, testes, isolamento real, verificação de segurança, varredura de políticas, checagem das funções, migrações, agendamentos, build, ponta a ponta (11 roteiros de navegador), rotina de restauração, checkout e carga.
- Etapas sem credencial no ambiente serão listadas como não executadas, com a variável que falta — não serão declaradas aprovadas.
- Os roteiros de navegador dependem do app respondendo localmente; serão executados contra o app em execução.

## 4. Fluxo completo de Open Finance

- Reexecutar os testes automatizados de conexão, cursor de lançamentos, sugestão de cartão, conciliação de extrato e escopo de fatura por empresa.
- Reexecutar o teste de concorrência da fila de eventos bancários (arquivo SQL já existente).
- Fluxo ponta a ponta em ambiente de teste: credenciais válidas, conector disponível, evento aceito só com segredo no cabeçalho, segredo em endereço rejeitado, evento processado sem carta morta, e exclusão vinda do banco nunca apagando lançamento confirmado. Se as credenciais de teste do provedor não estiverem no ambiente, isso é reportado como não executado e eu proponho o que falta para liberar.
- Confirmar que conta e cartão criados por conexão bancária respeitam a empresa da conexão, incluindo a autorização manual de cartão de crédito já aprovada.

## 5. Correções

Somente o que reprovar nesta bateria, na menor mudança possível, priorizando qualquer falha de isolamento entre empresas ou de mistura de saldos. Falhas fora deste escopo entram na lista final sem serem corrigidas.

## Detalhes técnicos

- Comandos: `bunx tsgo --noEmit`, `bunx vitest run`, `bunx vitest run src/test/rls src/test/tenancy`, `node scripts/policy-sweep.mjs`, `node scripts/security-lint.mjs --ci --strict`, `node scripts/migrations-check.mjs`, `node scripts/functions-config-check.mjs --require`, `node scripts/cron-healthcheck.mjs`, `bunx vite build`, `node scripts/run-e2e.mjs`, `node scripts/release-gate.mjs`, `node scripts/smoke-pluggy-sandbox.mjs`, testes SQL em `supabase/tests/`.
- Ambiente: `SUPABASE_DB_URL` disponível; `TEST_SUPABASE_URL`, `TEST_USER_A/B/C/D_*`, `TEST_COMPANY_1/2_ID`, `SMOKE_*`, `PLUGGY_SANDBOX_*`, `RESTORE_DB_URL` não disponíveis — etapas dependentes serão marcadas como não executadas.
- Provas diretas no banco rodam em transação com `ROLLBACK`, sem alterar dados reais.
- Linha de base da verificação de segurança: 63. Nenhum item novo será aceito.
- Sem migração, salvo se uma falha de isolamento exigir correção de política — nesse caso, migração dedicada e mínima.

## Resposta final

1. bateria executada; 2. resultado por etapa; 3. evidência do isolamento A×B; 4. evidência da separação dos saldos; 5. resultado do Open Finance ponta a ponta; 6. falhas encontradas; 7. correções aplicadas; 8. etapas não executadas e credencial que falta; 9. verificação de segurança antes/depois; 10. reversão.

Reversão: sem mudança de dados; se houver correção de código ou política, desfazer o commit da fase.
