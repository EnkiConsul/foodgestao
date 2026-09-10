# Análise da integração bancária (Open Finance) e conciliação

## O que está funcionando

- As 12 ligações ativas sincronizaram hoje sem falha de leitura.
- A correção de leitura por páginas está valendo: hoje entraram 2.410 lançamentos no extrato para conferência.
- Os avisos dos bancos estão sendo processados; sobrou 1 caso que depende de nova autorização no banco.
- Nenhum lançamento repetido pelo mesmo identificador do banco.

## Problemas encontrados

### 1. Mesmos bancos ligados em duas empresas (crítico)

Neon (01127486-7), C6 (35507609-8) e BMG (06924740-1) estão ligados na Família **e** na Raptor. As cópias da Raptor foram criadas hoje ao reprocessar avisos antigos, gerando contas duplicadas e 120 lançamentos repetidos aguardando conferência.

Decidido: esses bancos são da **Família**.

### 2. Nada impede a mesma conta bancária em duas empresas

Hoje o sistema aceita ligar a mesma conta em empresas diferentes, sem aviso.

### 3. Sincronização parcial em dois bancos

Banco do Brasil e Nubank retornaram sucesso parcial: parte das contas não veio. Aparece na tela, mas sem opção de tentar só o que faltou.

### 4. Fila grande de conferência

2.001 lançamentos pendentes, sendo 621 só do Banco do Brasil, sem forma prática de conferir em lote por período.

### 5. Cartões de crédito sem cartão vinculado

11 contas de cartão detectadas seguem sem cartão cadastrado, aguardando sua autorização.

### 6. Próxima sincronização com data vencida

Quando você sincroniza pelo botão, a data da próxima sincronização automática não é reagendada, ficando no passado.

## O que será feito

1. **Limpeza dos duplicados**: remover da Raptor as três ligações criadas hoje (Neon, C6, BMG), suas contas espelho, as contas bancárias criadas hoje sem movimento próprio e os 120 lançamentos repetidos ainda pendentes. As ligações da Família ficam intactas.
2. **Aviso antes de duplicar**: ao ligar um banco cuja conta já existe em outra empresa, mostrar aviso claro dizendo em qual empresa ela já está e pedir confirmação para continuar. Sem confirmação, não cria.
3. **Sucesso parcial**: guardar quais contas falharam e oferecer "Tentar novamente as contas que faltaram" na tela de bancos.
4. **Conferência em lote**: no extrato, permitir selecionar tudo de um período/banco e confirmar ou ignorar de uma vez, com resumo antes de aplicar.
5. **Cartões pendentes**: manter o aviso e adicionar lembrete no painel financeiro enquanto houver cartão sem vínculo.
6. **Reagendamento**: a sincronização manual passa a marcar a próxima automática corretamente.

## Detalhes técnicos

- Limpeza por `run_sql`: `pluggy_staging_transactions` (status `pending`) → `pluggy_accounts` → `pluggy_connections` dos itens `2f9eb17b…`, `e8048082…`, `069d4aa1…`; marcar `pluggy_v2_connections` desses itens como `superseded`; remover `accounts` `aea49d01…`, `0fa836f4…` (criadas 13:59 hoje) somente se não tiverem transações; `84dc8b61…` (C6 da Raptor, criada em 01/09) será mantida e apenas desvinculada.
- Duplicidade entre empresas: em `pluggy-sync-item`, antes de criar conexão/contas, procurar `pluggy_accounts` com mesmo `number_masked` + conector em outra empresa; devolver `duplicate_account_other_company` com nome da empresa; o front (`ConexoesPluggy.tsx` / `PluggyConnectDialog`) exibe confirmação e reenvia com `allow_duplicate: true`.
- Resolução de empresa: preferir `pluggy_connections` (V1); usar `pluggy_v2_connections` só quando não houver conflito de contas com outra empresa.
- Parcial: gravar contas com erro em `pluggy_connections.last_error` estruturado e expor ação de retry por conta.
- Conciliação em lote: ampliar `useExtratoConciliacao` / `ConciliacaoPluggy.tsx` com seleção por filtro e mutação em massa.
- `next_sync_at` atualizado no fim de `pluggy-sync-item` com o mesmo intervalo usado pelo cron.
- Testes: casos de duplicidade entre empresas e de retry parcial em `src/test/unit`.
