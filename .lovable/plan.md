# Preenchimento automático pelo CPF/CNPJ no cadastro de Cliente/Fornecedor

## Situação atual (verificada)

O formulário "Novo Contato" já consulta a Receita Federal, mas só quando o usuário clica no botão de lupa ao lado do campo CPF/CNPJ. Ao consultar, ele preenche nome (nome fantasia ou razão social), e-mail, telefone e endereço. Para CPF não existe consulta (não há base pública de CPF disponível).

## O que muda

1. **Busca automática**: ao terminar de digitar um CNPJ válido (14 dígitos), a consulta dispara sozinha, depois de uma pequena pausa na digitação — sem precisar clicar em nada. O botão de lupa continua disponível para repetir a busca manualmente.

2. **Feedback claro no campo**: enquanto consulta, mostra "Consultando Receita Federal…"; se der erro (CNPJ não encontrado, serviço indisponível), mostra a mensagem com opção de tentar de novo, e o usuário segue preenchendo à mão.

3. **Respeito ao que já foi digitado**: nome, e-mail, telefone e endereço só são sobrescritos se estiverem vazios; se o usuário já digitou algo, o dado da Receita não apaga. O nome preenchido automaticamente fica editável normalmente.

4. **Tipo sugerido e razão social**: quando a Receita devolve razão social diferente do nome fantasia, o nome usa o fantasia e a razão social vai para Observações (linha "Razão social: …"), para não perder a informação.

5. **Aviso de situação cadastral**: se a empresa não estiver ativa na Receita (baixada/suspensa/inapta), aparece um aviso no formulário. O cadastro continua permitido.

6. **CPF**: nada muda — sem consulta automática, apenas a validação de dígitos que já existe. Se o usuário digitar 11 dígitos, o botão de busca não aparece.

7. **Duplicidade**: a checagem que já existe continua igual e tem prioridade — se o CNPJ já estiver cadastrado, o aviso aparece e não roda a busca externa.

## Detalhes técnicos

- Alterações apenas em `src/components/contacts/ContactFormDialog.tsx`: extrair `runLookup` do IIFE para o corpo do componente e adicionar um `useEffect` com debounce (~600 ms) que dispara quando o documento normalizado tem 14 dígitos, é CNPJ válido, não há duplicado detectado e o CNPJ é diferente do último já consultado (guardado em `useRef`) — evita repetir a consulta a cada render/reabertura.
- Reaproveita `useCnpjLookup` (que já tem cache client-side de 6 h e cache no servidor via `lookup-cnpj`) e `notifyCnpjSuccess`/`notifyCnpjError`. Sem novas chamadas de rede além das que já acontecem hoje.
- Em modo edição (`editContact`), a busca automática não dispara ao abrir; só se o usuário mudar o documento.
- Preenchimento passa a ser condicional para o nome também (hoje ele sobrescreve). Aviso de `situacao` renderizado a partir do campo já retornado pelo endpoint.
- Sem migração de banco e sem mudanças em edge functions.
