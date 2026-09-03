# Cartões repetidos entre empresas: avisar e permitir remover a conexão duplicada

## O que os dados mostram agora

Não há mais nenhum cartão da Familia sendo lido pela Raptor. Os três cartões cadastrados continuam apenas na Familia. O que aparece hoje na Raptor são **contas de cartão detectadas no Open Finance dentro de conexões criadas na própria Raptor**:

- Neon 4103 — conexão criada hoje 18:10 na Raptor
- C6 "Bandeirado" 2555 — conexão criada hoje 18:10 na Raptor
- BMG "CARTAO BARCELONA" 2691 — conexão criada hoje 18:37 na Raptor

São os mesmos cartões físicos que já estão cadastrados na Familia, porque o mesmo acesso bancário foi conectado nas duas empresas. Elas estão na fila "cartão de crédito detectado" (status pendente) — nenhuma foi cadastrada como cartão da Raptor.

Ou seja: não é vazamento entre empresas, é conexão bancária duplicada. Hoje o app não avisa isso nem oferece um caminho para desfazer, então a fila fica insistindo em cartões que não pertencem àquela empresa.

## O que será feito

1. **Aviso de cartão já cadastrado em outra empresa** — na fila de cartões detectados e no diálogo de autorização, quando o cartão do Open Finance corresponder (banco + últimos 4 dígitos) a um cartão já cadastrado em outra empresa do usuário, mostrar um alerta: "Este cartão já está cadastrado na empresa Familia. Se o cartão não é desta empresa, remova a conexão bancária desta empresa."

2. **Descartar sem ficar voltando** — a ação "Ignorar" passa a valer também para novas leituras do mesmo cartão (mesmo banco + final) naquela empresa, de modo que ele não reapareça na fila em cada sincronização.

3. **Remover a conexão da empresa errada** — no cartão da conexão em Contas Financeiras, disponibilizar "Remover esta conexão desta empresa", com confirmação explicando que a conexão e o extrato pendente daquela empresa são apagados e que lançamentos já confirmados permanecem.

4. **Aviso ao conectar banco já conectado em outra empresa** — antes de concluir uma nova conexão, se o mesmo banco já estiver conectado em outra empresa do usuário, exibir aviso perguntando se é realmente esta a empresa dona daquela conta.

5. **Validar** — com Raptor selecionada, a fila deve mostrar o alerta de duplicidade nos três cartões; após remover as conexões duplicadas, a fila fica vazia e a Familia segue com seus três cartões e conciliação intactos.

## Detalhes técnicos

- Comparação de duplicidade: `pluggy_accounts.number_masked` / `raw->>'number'` + `pluggy_connections.connector_name` contra `credit_cards` (issuer/brand + last4) das outras empresas do usuário. Como a leitura de cartões passou a ser escopada por empresa, a checagem roda em uma função no banco (`security definer`, restrita a empresas em que o usuário é membro) que devolve apenas o nome da empresa onde o cartão já existe — sem expor os dados do cartão.
- "Ignorar persistente": nova tabela `pluggy_credit_ignores` (empresa, conector, final do cartão) com RLS por empresa e GRANTs; a fila de `usePluggyCreditReview` exclui os pares ignorados.
- Remoção da conexão: reutilizar a rotina existente de exclusão de conexão Open Finance (conexão + contas espelhadas + staging da empresa), acionada por conexão em `ContasBancarias`.
- Aviso ao conectar: checagem no início do fluxo do `PluggyConnectDialog`, comparando o conector escolhido com conexões ativas de outras empresas do usuário.
- Sem mudança em saldo, fechamento de fatura ou lançamentos confirmados.
