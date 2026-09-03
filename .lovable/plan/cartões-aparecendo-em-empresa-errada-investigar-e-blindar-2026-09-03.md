# Cartões aparecendo em empresa errada — investigar e blindar

## O que já foi verificado nos dados

- Existem apenas 3 cartões cadastrados (NEON 4103, Santander 3043, BMG 2691) e os três estão na empresa **Familia** — nenhum cartão pertence a **Raptor Systems**.
- Nenhuma conta do Open Finance está duplicada entre empresas: cada conta de banco/cartão pertence a uma única empresa. A semelhança de nomes ("CARTAO BARCELONA", "Bandeirado", "Sem nome") acontece porque o mesmo banco foi conectado nas duas empresas, com conexões diferentes.
- As telas de Cartões de Crédito, Conciliação e Contas Financeiras filtram por empresa nas consultas principais.
- A permissão de leitura de `credit_cards` permite ao **dono do registro** ler o cartão independentemente da empresa (`user_id = usuário` OU membro da empresa). Ou seja: qualquer consulta que esqueça o filtro de empresa devolve os cartões de todas as empresas do mesmo dono — que é exatamente o efeito relatado.

A causa exata da tela que vazou ainda **não está confirmada**, então o primeiro passo é reproduzir com a empresa Raptor Systems selecionada.

## Passos

1. **Reproduzir e localizar** — abrir, com Raptor Systems selecionada, Cartões de Crédito, Conciliação e Contas Financeiras e registrar exatamente qual bloco mostra o cartão de outra empresa (incluindo as chamadas de rede feitas sem filtro de empresa).
2. **Fechar a brecha na origem (banco)** — restringir a leitura de cartão empresarial à empresa: cartão com empresa só é visível para membros daquela empresa; a leitura pelo dono passa a valer apenas para cartão sem empresa. Assim, mesmo uma consulta sem filtro deixa de trazer cartão de outra empresa.
3. **Corrigir as consultas sem filtro de empresa** — auditar todas as leituras de cartões no app e garantir filtro por empresa/contexto. Já identificado: a busca de cartões usada para o rótulo na tela de Lançamentos está sem filtro de empresa. As demais telas (Cartões, Conciliação, formulário de lançamento, filtros de relatório, autorização do Open Finance) já filtram e serão reconferidas.
4. **Impedir vínculo cruzado** — validar, ao vincular conta do Open Finance a um cartão e ao confirmar conciliação para cartão, que a conta e o cartão são da mesma empresa; caso contrário, recusar com mensagem clara.
5. **Validar** — conferir com a empresa Raptor selecionada que nenhum cartão da Familia aparece em nenhuma das três telas, e que com a Familia selecionada os três cartões continuam visíveis e conciliáveis.

## Detalhes técnicos

- Migração ajustando a policy `credit_cards_select` (e as de escrita, pelo mesmo critério): `(company_id IS NULL AND user_id = auth.uid()) OR (company_id IS NOT NULL AND private.is_company_member(auth.uid(), company_id))`. Como o app é somente empresarial, isso não remove acesso legítimo. Grants existentes permanecem.
- Teste de RLS em `src/test/rls/` cobrindo: membro da empresa A não lê cartão da empresa B mesmo sendo o dono do registro.
- Frontend: adicionar filtro de empresa/contexto na consulta de cartões de `src/pages/Lancamentos.tsx`; revisar `useTransactionFormLookups`, `FluxoCaixaFiltros`, `ConciliacaoPluggy`, `CartoesCredito`, `useUpcomingCardInvoices`, `useCashFlowProjection` e a resolução de `?card=` em `ConciliacaoPluggy`/`ExtratoConciliacao` (hoje busca por id sem checar empresa).
- Validação de vínculo cruzado nas RPCs de conciliação de cartão (`pluggy_confirm_staging_card` e o vínculo em `pluggy_accounts.linked_credit_card_id`), comparando `company_id` do cartão com o da conta do Open Finance.
- Sem mudança em cálculo de saldo, fechamento de fatura ou lançamentos já confirmados.
