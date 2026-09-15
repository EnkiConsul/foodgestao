# Por que o nome da conta não salva — diagnóstico e correção

## O que já está confirmado

- O formulário de edição envia apenas os dados cadastrais (nome, tipo, banco, agência/conta, natureza) e só considera salvo quando o banco devolve a linha alterada. Se voltar "zero linhas", ele mostra erro — mesmo sem nenhuma falha de rede.
- As regras de acesso do banco só permitem alterar contas de uma empresa em que o usuário está cadastrado como sócio/administrador (ou membro com permissão de edição em "Contas").
- Nas duas empresas com "Praianos" no nome, o único usuário cadastrado como membro é o titular do Praianos. O seu usuário (Rafael, super administrador) não é membro dessas empresas.
- Existe uma regra que permite ao super administrador **ver** todas as contas, mas **nenhuma** que permita **alterar**. Ou seja: a conta aparece, o botão Editar aparece, e o salvamento volta sem alterar nada — exatamente o comportamento relatado.
- Nos últimos dias não há nenhum registro de alteração de nome de conta na auditoria, apenas atualizações automáticas de saldo bancário.

Falta apenas uma confirmação: o texto exato do erro que apareceu, para separar "nenhuma alteração aplicada" (falta de permissão) de outra causa.

## O que será feito

1. **Confirmar o caso real**: registrar, na tentativa de salvar, o motivo devolvido pelo banco (código e se veio zero linhas), sem expor dados sensíveis, para termos certeza do caminho percorrido nessa tela.
2. **Tornar o botão honesto**: quando o usuário não tem permissão de edição na empresa da conta (caso do super administrador que só tem visão), o botão Editar fica indisponível com explicação clara, em vez de abrir um formulário que nunca salva.
3. **Mensagem clara no salvamento**: se ainda assim o envio voltar sem alteração, a mensagem passa a dizer que a conta pertence a outra empresa e que a alteração precisa ser feita por um sócio/administrador dessa empresa, mantendo o formulário aberto com o que foi digitado.
4. **Caminho para renomear de verdade**: para o Praianos, o titular da empresa renomeia normalmente. Se você quiser renomear você mesmo, precisa estar cadastrado como administrador nessa empresa — posso preparar essa inclusão em uma etapa separada, com sua autorização explícita.

## Detalhes técnicos

- Arquivos: `src/components/accounts/AccountFormDialog.tsx` (mensagem e bloqueio do modo edição), `src/pages/ContasBancarias.tsx` (habilitar/desabilitar o botão Editar por permissão da empresa da conta), `src/lib/accounts/accountCopyTargets.ts` (texto de `describeSaveFailure` para o caso "zero linhas" com empresa de terceiros).
- A permissão é derivada do vínculo do usuário na empresa da conta (`company_members.role` owner/admin, ou `permissions.accounts = 'edit'`), sem afrouxar nenhuma política do banco.
- Sem migration: nenhuma política será criada para o super administrador alterar contas de empresas onde não é membro (isso ampliaria privilégio sem pedido explícito).
- Testes: botão Editar desabilitado sem permissão; salvamento com resposta de zero linhas mostra a mensagem nova e mantém o formulário aberto; caminho normal do sócio continua salvando.
- Nada é publicado; nenhum dado, vínculo ou consentimento é alterado.
