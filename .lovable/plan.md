# Cartão do Open Finance voltando na empresa errada

## O que está acontecendo (verificado nos dados)

O cartão BMG "CARTAO BARCELONA" (final 2691) está cadastrado na **Familia**, correto. O que aparece na Raptor não é o cartão da Familia: é uma **conta de cartão lida pela conexão BMG que existe na própria Raptor** (conexão criada em 25/08, com lançamentos já confirmados), e o mesmo vale para Neon 4103 e C6 2555.

Por que ela insiste em aparecer:

- O espelho de contas do Open Finance é identificado pelo código de conta do provedor (`pluggy_account_id`).
- Quando a conexão é reautenticada, o banco emite **novos códigos de conta para o mesmo cartão físico**. Foi o que ocorreu ontem/hoje: as leituras de 18:10 e 18:37 criaram linhas novas para Neon 4103, C6 2555 e BMG 2691 na Raptor.
- A decisão anterior do usuário ("Ignorar") fica presa à linha antiga. A herança existente só copia vínculo de cartão já autorizado — não copia "ignorado". Resultado: o cartão volta para a fila "cartão de crédito detectado" a cada nova leitura.
- Não há nenhum aviso de que aquele cartão (mesmo banco + mesmos 4 dígitos) já está cadastrado em outra empresa do usuário.

Não há leitura de cartão de uma empresa por outra: as permissões já estão escopadas por empresa.

## O que será feito

1. **A decisão do usuário passa a valer para o cartão, não para o código do provedor** — ao detectar um cartão, herdar a decisão anterior da mesma empresa pelo par banco + últimos 4 dígitos: se já foi ignorado, entra como ignorado; se já foi vinculado, herda o vínculo. Assim o cartão para de reaparecer depois de cada reautenticação.

2. **Aviso de cartão de outra empresa** — na fila de cartões detectados e no diálogo de autorização, quando o cartão corresponder a um cartão já cadastrado em outra empresa do usuário, mostrar: "Este cartão já está cadastrado na empresa Familia — confirme se esta conexão bancária deveria estar nesta empresa."

3. **Limpeza dos casos atuais** — marcar como ignoradas as linhas pendentes duplicadas de Neon 4103, C6 2555 e BMG 2691 na Raptor, herdando a decisão anterior. Nada de conexão, conta ou lançamento confirmado é apagado.

4. **Ação para corrigir a empresa da conexão** — no cartão da conexão em Contas Financeiras, oferecer "Remover esta conexão desta empresa", com confirmação explicando que a conexão e o extrato pendente daquela empresa saem, e que lançamentos já confirmados permanecem. É o caminho para quem conectou o banco na empresa errada.

5. **Validar** — com Raptor selecionada, a fila de cartões detectados fica vazia; forçar uma nova leitura e confirmar que os cartões não voltam; com Familia selecionada, os três cartões e as faturas seguem intactos.

## Detalhes técnicos

- `supabase/functions/pluggy-sync-item/index.ts`: na etapa de espelhamento de contas CREDIT, ampliar a herança atual para buscar a linha anterior da mesma empresa por `number_masked` (+ conector) considerando também `credit_review_status IN ('ignored','linked')`, e replicar status/vínculo/`credit_review_at`. Sem alterar o `onConflict: 'pluggy_account_id'`.
- Nova função no banco (`security definer`, restrita a empresas do usuário) que, dado banco + final, devolve apenas o **nome da empresa** onde já existe cartão cadastrado — usada pelo aviso, sem expor dados do cartão de outra empresa.
- `usePluggyCreditReview` passa a trazer o aviso de duplicidade junto de cada pendência; `PluggyCreditCardReviewDialog` exibe o alerta acima dos campos.
- Migração de dados pontual marcando como `ignored` as três linhas pendentes da Raptor cujo par banco+final já tinha decisão anterior naquela empresa.
- Remoção de conexão por empresa: reutilizar a rotina existente de exclusão de conexão Open Finance (`pluggy-pause-or-delete`), acionada por conexão em `ContasBancarias`.
- Sem mudança em saldo, fechamento de fatura, conciliação ou lançamentos confirmados.
