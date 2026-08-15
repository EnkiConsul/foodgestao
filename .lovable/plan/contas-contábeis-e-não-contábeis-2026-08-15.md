# Contas Contábeis e Não Contábeis

## Entendimento da necessidade

Sim. A empresa movimenta dinheiro que a contabilidade enxerga (banco, PIX, cartão) e dinheiro que circula por fora dos livros (caixa interno, empréstimos entre sócios, acertos informais). Hoje a tabela de contas não tem nenhum campo que separe os dois mundos — só nome e tipo de conta — então qualquer relatório ou usuário externo vê tudo junto.

Marcar cada conta como **Contábil** ou **Não Contábil** cria a fronteira necessária para, em seguida, dar acesso ao contador vendo apenas os lançamentos contábeis, sem esconder nada do empresário, que continua vendo o quadro completo.

## Fase 1 — Classificação na conta bancária

- Novo campo obrigatório no cadastro de conta: **Natureza contábil** — "Contábil" (padrão) ou "Não Contábil".
- Aparece no formulário de criação e de edição de conta, com texto curto de ajuda explicando o efeito.
- Na tela de Contas Bancárias: badge "Não Contábil" no cartão/linha da conta e filtro rápido por natureza.
- Contas já existentes ficam como Contábil; as contas semeadas automaticamente já nascem coerentes ("Caixa Contábil" = contábil; "Caixa não Contábil" e as duas de empréstimos = não contábil).
- Nada muda em saldos, lançamentos ou nos relatórios atuais nesta fase.

## Fase 2 — Perfil Contabilidade

- Novo papel de acesso da empresa: **Contabilidade** (somente leitura).
- Esse usuário vê apenas contas marcadas como Contábeis e apenas os lançamentos vinculados a elas; contas não contábeis e seus lançamentos ficam invisíveis para ele.
- Sem permissão para criar, editar ou excluir nada; sem acesso aos módulos de pessoal e pedidos.
- Convite para o contador reaproveita o fluxo de convite de membros já existente.

## Detalhes técnicos

- Migração: coluna `accounts.is_accounting boolean NOT NULL DEFAULT true`; backfill `false` nas contas cujo nome corresponde a "não contábil" e às duas contas de empréstimos; atualizar `seed_default_account_on_company` para gravar o valor correto por conta.
- Front-end: `AccountFormDialog.tsx` (campo obrigatório em Select/RadioGroup, incluído nos inserts/updates), `ContasBancarias.tsx` (badge + filtro), tipos regenerados de `accounts`.
- Fase 2: adicionar `contabilidade` ao enum `company_role`; funções auxiliares `has_company_role`/`is_company_accountant` (SECURITY DEFINER); políticas RLS de `accounts` e `transactions` restringindo esse papel a `is_accounting = true`; ocultar itens de menu e ações de escrita na UI para o papel.
- Ordem sugerida: entregar a Fase 1 completa e validada antes de iniciar a Fase 2, porque a RLS do contador depende da coluna já preenchida.
