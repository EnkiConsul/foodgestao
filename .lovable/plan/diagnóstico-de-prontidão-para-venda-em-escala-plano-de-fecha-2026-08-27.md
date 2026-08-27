# Diagnóstico de prontidão para venda em escala + plano de fechamento

Resultado da análise: **a base de produto e segurança está sólida, mas o sistema ainda não está pronto para venda em alta escala**. Faltam operação confiável (rotinas automáticas quebradas), tratamento de exceções de integração, e validações externas nunca executadas (backup/restore, sandbox de pagamento e banco, e-mail/MFA).

## O que já está bom (verificado agora)

- Build e tipos: verificação estrita passa sem erros; ESLint sem erros.
- Testes: 942 testes passando, 0 falhas (46 pulados — ver risco abaixo).
- Segurança: varredura sem achados críticos ou altos; só 2 avisos já aceitos por você.
- Multiempresa: políticas de acesso ativas nas tabelas do app; sem divergência de saldo bancário pendente.
- Faturamento: 3 planos ativos, 25 assinaturas ativas, 18 empresas.

## Riscos que bloqueiam a escala

### 1. Rotinas automáticas quebradas (crítico)
Quatro agendamentos antigos continuam ativos e falhando a cada 5 minutos, apontando para funções/tabelas que não existem mais (`reap_open_finance_stuck_runs`, `pluggy_v2_expire_stale_requests`, `pluggy_expire_stale_connect_requests`, `open_finance_connections`). Somaram ~850 falhas nos últimos 2 dias, a última hoje 18:15. Outros três agendamentos do módulo Pedidos (removido) também falharam até 26/08. Isso polui o monitoramento e esconde falhas reais.

**Ação:** remover os agendamentos órfãos, deixar apenas os 9 jobs válidos, e ligar o `cron-healthcheck` como verificação obrigatória (falha se algum job não rodou na janela ou teve erro).

### 2. Eventos de banco sem tratamento (alto)
33 eventos da Pluggy estão em "dead letter" com o motivo `pending_manual_link` (último hoje 14:22) e não há fila de trabalho visível para resolvê-los. Em escala isso significa lançamento não importado sem ninguém saber.

**Ação:** tela administrativa de dead letters (motivo, empresa, item, ação de re-processar/descartar) + regra de vínculo automático quando a conta já existe, para `pending_manual_link` deixar de gerar dead letter.

### 3. Configuração de funções fora de sincronia (médio)
`supabase/config.toml` declara funções que não existem mais e **não declara** duas que existem e precisam de acesso público controlado (`pluggy-cron-sync`, `pluggy-webhook-config`). O baseline do Deno também lista 6 funções já removidas.

**Ação:** sincronizar `config.toml` e o baseline com as funções reais; adicionar verificação no gate que falha em qualquer divergência.

### 4. Cobertura de isolamento entre empresas não roda de verdade (alto para escala)
Os testes de tenancy e de políticas ficam pulados por falta de credenciais de teste — ou seja, o isolamento multiempresa não é provado automaticamente a cada mudança. Idem E2E (Playwright), que não roda no gate.

**Ação:** provisionar o ambiente de teste (usuários A–D, empresas 1 e 2) com o seed já previsto, publicar os segredos e tornar tenancy + E2E obrigatórios.

### 5. Validações externas nunca executadas (crítico antes de vender)
Pendentes por dependerem de credenciais/infra: simulação de restauração de backup, RPO/RTO, sandbox Asaas ponta a ponta (cobrança + webhook assinado), sandbox Pluggy, e-mail (domínio, remetente, supressões), MFA ponta a ponta e recuperação, e PITR.

**Ação:** executar cada roteiro já escrito e anexar evidência; o que depender de plano/infra fica registrado como pendência com o passo exato.

### 6. Capacidade e desempenho não medidos (alto para "alta escala")
Volume atual é pequeno (350 lançamentos, 18 empresas, 13 conexões bancárias). Não existe medição de consulta lenta, índices de chave estrangeira nas tabelas que crescem (lançamentos, itens de escala, extrato bruto da Pluggy) nem teste de carga.

**Ação:** medir as 20 consultas mais lentas, criar os índices faltantes com medição antes/depois, definir tamanho de instância recomendado por faixa de clientes e rodar um teste de carga com dados sintéticos (por exemplo 200 empresas / 500 mil lançamentos).

### 7. Prontidão comercial e suporte (médio)
Verificar consistência de cobrança (assinaturas ativas x empresas x isenções), fluxo de inadimplência/suspensão, limites de uso por plano, exportação de dados e exclusão de conta (LGPD), e trilha de auditoria de ações administrativas.

## Ordem de execução proposta

1. Limpar agendamentos órfãos + healthcheck obrigatório.
2. Dead letters: tela + vínculo automático.
3. Sincronizar `config.toml`/baseline + verificação no gate.
4. Ambiente de teste: tenancy e E2E obrigatórios.
5. Desempenho: consultas lentas, índices, teste de carga, guia de instância.
6. Validações externas com suas credenciais (backup/restore, Asaas, Pluggy, e-mail, MFA, PITR).
7. Revisão comercial (cobrança, limites, LGPD, auditoria).
8. Relatório único de certificação com evidência por item.

## Notas técnicas

- O congelamento de release está encerrado, então as correções entram normalmente.
- Nenhum segredo aparece em log, relatório ou tela; scripts só reportam presente/ausente.
- Tetos de qualidade só descem; baselines de Deno e de migrações só encolhem.
- Correções sem `any`, `@ts-ignore` ou desativação de regra.
