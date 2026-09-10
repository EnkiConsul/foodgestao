# Verificação completa da integração de Open Finance (Pluggy)

## O que está funcionando (verificado agora)

- As 10 conexões ativas sincronizaram hoje às 12:07–12:12, todas com resultado "sucesso"; nenhuma conexão com erro pendente.
- Os avisos do banco continuam chegando: 120 nas últimas 24h, o mais recente às 13:34 de hoje. 1.141 já processados.
- A leitura de lançamentos voltou a passar da primeira página: os pendentes de conciliação subiram de 621 para 2.001 (Banco do Brasil 1.451, Familia 382, Raptor 162, outra 6), do dia 08/06 até hoje.
- A rotina automática roda de hora em hora e a fila de avisos a cada minuto.

## Erros encontrados

### 1. Conexões que o sistema não consegue atribuir a uma empresa (erro real)

Três conexões ficaram travadas com "empresa não resolvida" e 20 avisos foram para a lixeira: Neon e C6 Bank da Raptor e Banco Bmg da Raptor. O ponto é que **essas conexões existem no sistema e já têm a empresa preenchida** — o problema é que a sincronização procura a empresa apenas no cadastro antigo de conexões e nunca no cadastro novo, onde esses três estão. Resultado: nunca sincronizam e o extrato delas não chega à conciliação.

Correção: ao sincronizar, procurar a empresa também no cadastro novo de conexões (e no espelho de contas), antes de desistir. Depois, reprocessar os avisos que ficaram na lixeira.

### 2. Conexão do BTG parada há 12 dias

A conexão BTG da Raptor está "atualizando" desde 29/08 e nunca gerou contas. Hoje ela fica eternamente nesse estado, sem aviso ao usuário.

Correção: quando uma conexão passar de 24h em atualização, marcá-la como "requer nova autorização" na tela de Conexões, com botão para reconectar.

### 3. Falha do banco tratada como erro silencioso

Um aviso ficou na lixeira com "site indisponível ou em manutenção" (falha do banco, não do sistema). Isso deve aparecer na tela como indisponibilidade temporária, e o sistema deve tentar de novo automaticamente mais tarde em vez de descartar.

### 4. Cartões de crédito sem vínculo

11 cartões de crédito vieram dos bancos sem vínculo com um cartão do sistema. Isso é o comportamento combinado (o usuário precisa autorizar), mas hoje não há um aviso claro na tela dizendo "há 11 cartões aguardando sua autorização".

Correção: faixa de aviso com a contagem e link direto para a fila de autorização.

### 5. Nada a corrigir, mas registrar

Duas conexões voltam com "sucesso parcial" (Nubank e Banco do Brasil): o banco entrega parte dos produtos. Vale mostrar isso na tela como "parcial" com a explicação, para não parecer erro.

## Detalhes técnicos

- `pluggy-sync-item`: incluir `pluggy_v2_connections` (e `pluggy_accounts` → `connection_id`) na cadeia de resolução de empresa, antes de retornar `company_id_required_on_first_connect`.
- `pluggy-webhook-worker`: reprocessar dead letters com `error_code='pending_manual_link'` após a correção; tratar `item_error` de manutenção como retentável com backoff longo em vez de fatal.
- Detecção de item preso: comparar `updated_at` de conexões em `updating` e sinalizar `requires_reauth` na leitura das telas.
- Frontend `ConexoesPluggy.tsx` / `ConciliacaoPluggy.tsx`: estados "parcial", "requer nova autorização", "banco em manutenção" e faixa de cartões aguardando autorização.
- Sem migração de schema.

## Verificação

- As três conexões da Raptor sincronizam e passam a alimentar a conciliação.
- Zero avisos na lixeira com "empresa não resolvida".
- Conexão presa aparece como "requer nova autorização" na tela.
