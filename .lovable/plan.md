# Erro "contact_forbidden" ao confirmar lançamento na conciliação

## O que está acontecendo

Ao confirmar, o servidor só aceita um fornecedor/cliente que esteja **ligado à empresa** do lançamento. Quando essa ligação não existe, ele recusa com `contact_forbidden`.

Verificado agora no banco: existem exatamente dois cadastros criados hoje às 17:27 (horário de Brasília) **sem nenhuma empresa ligada** — "Audax Gestao Empresarial LTDA" e "AUT. Fat.cartao Master Card Final 9540", ambos do seu usuário. Eles aparecem na lista da conciliação (a lista também mostra cadastros sem ligação, de propósito), mas a confirmação os rejeita.

Por que a ligação não foi gravada: a regra de gravação da tabela de ligações consulta a tabela de contatos, e a regra de leitura de contatos consulta de volta a tabela de ligações. Esse vai-e-volta é exatamente o mesmo defeito que travou as categorias na semana passada ("recursão infinita"), e ali a correção foi criar uma função de checagem isolada. Nenhum registro de auditoria de "contato criado" existe para esses dois cadastros, o que confirma que o salvamento parou justamente na etapa da ligação.

Agravante: no fluxo da conciliação a tentativa de ligar o contato à empresa **ignora o erro em silêncio**, então a tela segue para a confirmação como se estivesse tudo certo e o usuário só descobre o problema no `contact_forbidden`.

## O que será feito

0. **A lista passa a mostrar só os ligados à empresa em uso**: o seletor de fornecedor/cliente da conciliação deixa de incluir cadastros sem ligação com a empresa. Assim o item recusado pelo servidor nem chega a ser oferecido. Quem não estiver na empresa se cadastra ou se liga pelo botão de cadastro, que já grava a ligação.

1. **Corrigir a regra de gravação da ligação contato ↔ empresa** (mesma solução já usada nas categorias): uma função de checagem isolada decide se a pessoa pode ligar aquele contato, sem a consulta circular. Permissão continua a mesma: só quem pode editar clientes/fornecedores da empresa, e só sobre contatos próprios ou já ligados a empresas dela.
2. **Nunca mais falhar em silêncio**: se a ligação não puder ser gravada, a conciliação para aquele item, mantém a linha selecionada e mostra o motivo, em vez de seguir e devolver erro técnico.
3. **Mensagem clara no lugar do código técnico**: `contact_forbidden` passa a aparecer como "Este fornecedor/cliente não está ligado à empresa deste lançamento", com ação de ligar e tentar de novo.
4. **Regularizar os dois cadastros de hoje**: ligá-los à empresa em que foram criados, com sua confirmação, para que a conciliação volte a aceitá-los.
5. **Testes**: um teste garante que a ligação é gravada e conferida no fluxo da conciliação, e que uma falha de ligação bloqueia a confirmação em vez de deixá-la seguir.

## Detalhes técnicos

- Migração: `private.contact_linkable_by(_user_id, _contact_id)` SECURITY DEFINER (espelho de `private.category_linkable_by`) e substituição de `contact_companies_insert_policy` por `can_edit_company_module(uid, company_id, 'contacts') AND private.contact_linkable_by(uid, contact_id)`, eliminando o `EXISTS` sobre `public.contacts` que reentra em `contact_companies`. Reversível (a policy anterior é recriada no rollback). Nenhuma outra policy alterada.
- Verificar na mesma migração a divergência de nome de módulo já observada: as policies de `contact_companies` usam `'contacts'` e `private.contact_editable_by_member` usa `'contatos'`; alinhar para o nome usado em `company_members.permissions` sem ampliar permissão.
- `src/lib/conciliacao/contacts.ts`: `fetchConciliacaoContacts` devolve apenas os contatos de `fetchAllCompanyContacts` (fim da mistura com `fetchAllUserContacts`/`linkedToCompany: false`); `ensureContactCompanyLink` passa a devolver sucesso/erro (lê o retorno do insert e confere a linha) em vez de descartar o erro.
- `src/pages/ConciliacaoPluggy.tsx`: sugestões automáticas e importação em lote passam a considerar só contatos da empresa; `unlinkedContactIds` e o bloco de `pendingLinks` deixam de ser necessários para a lista, permanecendo apenas a checagem de segurança antes da RPC.
- `src/pages/ConciliacaoPluggy.tsx` (`confirmIds`, bloco de `pendingLinks`): item cujo vínculo falhar entra em `resultado.falhas` com novo motivo `contato_sem_vinculo` e não é enviado à RPC.
- `src/lib/conciliacao/confirmResultado.ts`: novo motivo em `MotivoBloqueio` + texto em `MENSAGEM_MOTIVO`; mapear também `contact_forbidden` vindo da RPC para esse motivo.
- Dados: `INSERT` das duas ligações faltantes em `contact_companies` (somente esses dois contatos, empresa do próprio usuário), sem tocar em lançamentos, saldos ou nas linhas do extrato.
- Fora deste escopo: as demais policies de isolamento, contatos de outras empresas e qualquer alteração em `pluggy_confirm_staging*`.
