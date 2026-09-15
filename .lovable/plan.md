--- Continuação da bateria P0 (ajuste do usuário de teste) ---

# Situação até agora (já executado neste SHA)

- Isolamento (suíte automatizada): 19 arquivos aprovados, 4 ignorados — 162 testes aprovados, 50 ignorados.
- Suíte completa: 191 arquivos aprovados, 1770 testes aprovados, 50 ignorados.
- Tipos: sem erros. Migrações: 670 aprovadas na verificação estática.
- Verificação de segurança: 63 achados — igual à linha de base, nenhum novo.
- Varredura de políticas: 1 crítico (`mkt_site_settings`, configurações do site público, leitura anônima intencional) + avisos antigos. Nenhum na área financeira.
- Agendamentos: 14 rotinas ativas confirmadas no banco; o verificador automático não roda neste ambiente por falta de permissão de leitura do agendador (limitação do ambiente, não do produto).
- Visitante sem login: zero linhas em contas, lançamentos, categorias, contatos, orçamentos, cartões, faturas, formas de pagamento, centros de custo, plano de contas e conexões bancárias.

# Ajuste pedido

O usuário pediu para usar `rcbruto77@gmail.com`. Essa conta é **administradora do sistema** e, por regra do produto, enxerga todas as empresas. Portanto ela serve como lado "A", mas não prova negação: para provar que uma empresa não alcança a outra é preciso um usuário comum.

Prova em duas pontas:

- Lado A: `rcbruto77@gmail.com` (dono de ClicSorte, AVETO 360, Dra. Michelle Castro e Familia). Registro do que ele vê, evidenciando que a visão ampla vem do papel de administrador do sistema, não de falha de isolamento.
- Lado B: um usuário comum, dono apenas de uma empresa (`eumurilo.castro@gmail.com`, APERTE 3D). Consultas às empresas do lado A devem retornar zero linhas em contas, lançamentos, categorias, contatos, orçamentos, cartões, faturas, formas de pagamento, centros de custo, plano de contas e conexões bancárias; tentativas de criar, alterar e apagar dados nas empresas do lado A devem ser recusadas.

Se o usuário preferir não usar a conta de terceiro para o lado B, uso apenas as provas automatizadas já existentes para a negação e registro isso como cobertura parcial.

# O que falta executar

1. Provas de isolamento A×B pela API real, com sessão de teste de cada lado, incluindo tentativas de leitura, criação, alteração e exclusão cruzadas.
2. Separação saldo bancário × saldo contábil: confirmar que o valor lido do banco fica em campo próprio (com data e origem), que o saldo do sistema continua vindo dos lançamentos e que a diferença exibida é apenas comparação. Prova no banco em transação desfeita.
3. Open Finance ponta a ponta: reexecutar os testes de conexão, cursor de lançamentos, sugestão de cartão, conciliação de extrato e escopo de fatura por empresa; teste de concorrência da fila de eventos; e o roteiro de certificação em ambiente de teste do provedor — este último depende de credenciais de teste que não estão neste ambiente e será reportado como não executado, com a lista do que falta.
4. Portão de release: rodar o portão e reportar etapa por etapa, marcando como não executadas as etapas sem credencial (usuários de teste de multiempresa, ambiente de homologação, banco descartável de restauração, carga).
5. Roteiros de navegador (11 arquivos), incluindo os de exclusão de conta bancária e extrato multiempresa.
6. Correções apenas do que reprovar, priorizando isolamento e mistura de saldos.

# Detalhes técnicos

- Sessões de teste criadas pelo utilitário de sessão do ambiente; nenhuma senha de usuário é lida ou exibida.
- Provas diretas no banco em `BEGIN ... ROLLBACK`; nenhum dado real alterado.
- Linha de base da verificação de segurança: 63, sem novos achados.
- Sem migração, salvo falha real de política.

# Resposta final

1. bateria executada; 2. resultado por etapa; 3. evidência do isolamento A×B; 4. evidência da separação dos saldos; 5. resultado do Open Finance; 6. falhas; 7. correções; 8. etapas não executadas e credencial faltante; 9. verificação de segurança antes/depois; 10. reversão.
