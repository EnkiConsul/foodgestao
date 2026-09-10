# Conciliação: o que a integração está trazendo hoje

Conferência feita agora nos dados reais. A coleta em si está saudável (todas as conexões ativas sincronizaram hoje às 14:09–14:12 com resultado "sucesso"), mas **a tela de Conciliação não mostra tudo o que foi importado**.

## O que está errado

### 1. A tela corta em 500 lançamentos
A Conciliação carrega no máximo 500 linhas. O Praianos Bar e Restaurante tem 621 lançamentos pendentes só na conexão ativa do Banco do Brasil — ou seja, 121 lançamentos existem, foram importados, e simplesmente não aparecem. Não há paginação nem aviso de corte.

### 2. Lançamentos "presos" em conexões antigas
Quando o banco é reconectado, a conexão anterior fica marcada como encerrada e a tela deixa de exibir as linhas dela (regra criada para não ressuscitar extrato de contas excluídas). O efeito colateral:

- **Raptor Systems**: 272 lançamentos (161 pendentes, de 08/06 a 09/09) da conta C6 35507609-8 ficaram na conexão encerrada e **nenhum deles existe na conexão nova**. Hoje a Raptor mostra apenas 9 lançamentos do Santander — na prática, a conciliação da Raptor está vazia.
- **Praianos**: das 833 linhas em conexões encerradas, 698 têm cópia na conexão ativa, mas **135 não têm** — extrato de julho/agosto que desapareceu da tela.
- **Familia**: 42 linhas nessa situação, das quais 41 já existem na conexão ativa (impacto mínimo).

A mesma conta bancária (00022794-3 do Praianos) aparece com três identificadores diferentes de conta Open Finance, um por reconexão — é daí que vem a divisão.

### 3. Contas sem vínculo (comportamento esperado, só falta aviso)
21 lançamentos da Familia e 1 do Aperte 3D vêm de contas de cartão ainda não autorizadas. Está correto ficarem fora da conciliação, mas o usuário não é avisado de que existe extrato aguardando autorização.

## Correções propostas

1. **Paginação real na Conciliação**: carregar em páginas (500 por vez) com "carregar mais" ou rolagem infinita, e mostrar o total de lançamentos do escopo, para nunca mais esconder linha importada.
2. **Reagrupar as contas por reconexão**: quando a mesma conta bancária (mesmo número mascarado e mesmo vínculo local) reaparece em uma conexão nova, migrar os lançamentos das conexões encerradas para a conta ativa, descartando os que já existem lá (comparação por identificador do banco e, na falta dele, por data + valor + descrição). Isso devolve os 161 pendentes da Raptor e os 135 do Praianos sem duplicar nada.
3. **Passar a fazer isso automaticamente**: na sincronização, ao detectar que a conta reconectada corresponde a uma conta antiga da mesma empresa, herdar o histórico em vez de deixá-lo órfão.
4. **Faixa de aviso** no topo da Conciliação quando houver extrato de contas ainda não autorizadas, com link para a fila de autorização.
5. **Correção pontual dos dados atuais** de Raptor, Praianos e Familia, seguindo a regra do item 2.

## Detalhes técnicos

- `src/pages/ConciliacaoPluggy.tsx`: substituir `.limit(500)` por busca paginada com `range()` + contagem (`count: "exact"`), mantendo os filtros atuais de conexão encerrada/conta sem vínculo.
- Migração/rotina de consolidação: para cada `(company_id, number_masked, linked_account_id)` com mais de um `pluggy_account_id`, eleger a conta da conexão ativa e atualizar `pluggy_staging_transactions.pluggy_account_id`/`connection_id` das demais, apagando as colisões por `external_id` (ou por data+valor+descrição quando ausente). Preservar `status`, `matched_transaction_id` e as linhas já confirmadas/ignoradas.
- `supabase/functions/pluggy-sync-item` (+ `_shared/pluggy-v2-materialize.ts`): ao criar/atualizar `pluggy_accounts`, reaproveitar a conta anterior da mesma empresa com o mesmo `number_masked` e vínculo, herdando o histórico.
- Reutilizar `usePluggyCreditReview` para a contagem da faixa de contas aguardando autorização.

## Verificação

- Raptor volta a exibir os 161 pendentes do C6; Praianos exibe 756 pendentes (621 + 135) sem duplicidade.
- Total de linhas por empresa igual entre banco e tela.
- Nenhuma linha confirmada/ignorada é perdida ou reaberta.
