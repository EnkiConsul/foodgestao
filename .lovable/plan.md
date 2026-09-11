# Auditoria de erros com detalhes suficientes para resolver

## O que está acontecendo

Conferi o erro que apareceu na sua tela ("Falha simulada para validar chamado", 5 vezes, tela `/index`). O registro guardado tem mais informação do que a tela mostra:

- a pilha técnica do erro (onde exatamente falhou) **está gravada**, mas a tela nunca exibe;
- o navegador usado também está gravado e não aparece;
- o usuário está vazio nesse caso porque a ocorrência veio de uma sessão sem pessoa autenticada — hoje o sistema não diz isso, só deixa o campo em branco;
- só sobra a última ocorrência: as 5 repetições não têm histórico de quem, quando e em qual tela.

Ou seja: parte do problema é exibição, parte é falta de histórico e de identificação de quem estava usando.

## O que vou fazer

1. **Painel "Detalhes técnicos" em cada erro** (recolhido, abre com um toque), com: tela, ação, endereço da tela, origem (tela/banco/servidor/importação), código do erro, mensagem completa, navegador/aparelho, pessoa e e-mail, empresa, primeira e última vez, quantidade de repetições e a pilha técnica em bloco rolável.
2. **Botão "Copiar detalhes"**, que copia tudo em texto — inclusive a pilha — para anexar no chamado ou mandar ao suporte.
3. **Histórico de ocorrências**: guardar as últimas repetições de cada erro (quem, quando, em qual tela, com qual mensagem) e listá-las no painel, para ver se é uma pessoa só ou todo mundo.
4. **Identificação de quem usava**: gravar também o e-mail da conta e, quando não houver ninguém logado, mostrar "sem usuário identificado (sessão não autenticada)" em vez de campo vazio.
5. **Erros do servidor com nome da função**: nas falhas registradas pelas funções do servidor, gravar o nome da função na tela/origem, para saber onde procurar.
6. **Chamados**: mostrar também o e-mail de quem abriu, junto do protocolo.

Tudo isso vale igual na tela de erros de Pessoas e na do backoffice (todas as empresas).

## Detalhes técnicos

- Nova tabela `public.app_error_occurrences` (error_log_id, company_id, user_id, user_name, user_email, route, code, message, details, created_at) com GRANTs, RLS espelhando `app_error_logs` (membros da empresa + super_admin) e limpeza automática mantendo as 20 ocorrências mais recentes por erro.
- `app_error_log_record`: passa a inserir a ocorrência, resolver `user_email` via `auth.users`, preencher `user_email` em `app_error_logs` e fazer merge de `details` em vez de substituir (não perder pilha anterior).
- `src/lib/errorLog.ts`: mantém envio de `stack`, agente e contexto; acrescenta nome do componente quando disponível no `ErrorBoundary`.
- `src/hooks/useAppErrorLogs.tsx`: novos campos e busca das ocorrências por erro; `src/pages/dp/DpErros.tsx`: painel de detalhes, lista de ocorrências e botão de copiar.
- Funções do servidor: helper compartilhado de registro passa `surface` com o nome da função.
- Testes: formatação do texto copiado e resolução do rótulo de usuário não identificado.
