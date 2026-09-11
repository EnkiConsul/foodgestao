# Relato do usuário ligado à auditoria de erros

## Objetivo
Sempre que o sistema identificar uma falha real, mostrar um aviso chamativo com a ação **“Relatar problema”**. O fluxo funcionará como uma abertura de chamado ligada automaticamente ao erro técnico, incentivando o usuário a explicar detalhadamente o que aconteceu e o que tentava fazer.

## Experiência do usuário
- Substituir o aviso discreto por um destaque visual claro de **“Ajude-nos a corrigir este problema”**, com botão principal **“Relatar problema”**.
- Ao clicar, abrir uma janela de chamado com:
  - descrição obrigatória do que ocorreu;
  - descrição opcional do que estava tentando fazer;
  - identificação automática da tela, empresa, usuário, data, navegador e erro técnico, sem pedir esses dados novamente.
- Confirmar o envio, gerar um protocolo visível e impedir envios vazios ou repetidos por clique duplo.
- Nas falhas que impedem a exibição da tela, incluir o mesmo botão junto às opções de tentar novamente, recarregar e voltar ao início.
- O chamado continuará opcional para não bloquear o trabalho, mas o destaque permanecerá visível enquanto a mensagem de erro estiver aberta.

## Auditoria de erros
- Preservar o agrupamento atual dos erros técnicos por assinatura e empresa.
- Criar um histórico separado de relatos ligado ao erro original, permitindo vários relatos do mesmo problema por usuários ou momentos diferentes, sem sobrescrever informações anteriores.
- Exibir na auditoria de Pessoas 360° e no backoffice:
  - texto completo do relato;
  - usuário e empresa;
  - data e hora;
  - tela e ação em que ocorreu;
  - erro técnico relacionado.
- Destacar erros que receberam relatos e permitir abrir o histórico de relatos dentro do item.
- Incluir o texto dos relatos na busca da auditoria.
- Tratar cada envio como chamado, com protocolo, situação **Aberto**, **Em análise**, **Resolvido** ou **Ignorado**, observações internas e histórico de mudanças.
- Permitir ao gestor e ao backoffice acompanhar os chamados sem misturá-los com simples ocorrências automáticas sem relato.

## Cobertura dos erros
- Evoluir o registrador central para devolver a identificação do erro gravado, necessária para vincular o relato.
- Conectar o aviso com botão aos erros de tela já capturados, às falhas inesperadas do navegador e às rejeições não tratadas.
- Criar um mecanismo reutilizável para os fluxos que já tratam falhas de salvar, importar, publicar ou confirmar, evitando implementar uma janela diferente em cada página.
- Não mostrar o convite para alertas informativos ou validações comuns de formulário; somente para falhas reais da operação.

## Segurança e privacidade
- Permitir que cada usuário envie relatos apenas autenticado e em empresas às quais possui acesso.
- Permitir leitura dos relatos somente a donos/administradores da respectiva empresa e ao backoffice autorizado.
- Não guardar senhas, tokens, conteúdo integral de documentos ou outros dados sensíveis.
- Limitar o tamanho dos textos e tratar o conteúdo como texto simples.

## Detalhes técnicos
- Criar uma tabela de relatos vinculada a `app_error_logs`, com concessões explícitas, RLS, índices e auditoria temporal.
- Criar uma função protegida para anexar o relato ao erro, validando usuário, empresa, vínculo e tamanho do conteúdo.
- Ajustar `reportError` para retornar o identificador do registro, mantendo o agrupamento e a proteção contra repetição já existentes.
- Adicionar um diálogo reutilizável de relato e uma ação reutilizável nos avisos de falha.
- Atualizar os tipos, hooks e a tela compartilhada de auditoria usada em Pessoas 360° e no backoffice.

## Validação
- Testar vínculo correto entre relato e erro agrupado, múltiplos relatos, obrigatoriedade, limite de texto e prevenção de clique duplo.
- Testar permissões entre empresas e acesso do backoffice.
- Simular erro de tela, falha de operação e rejeição inesperada em desktop e celular.
- Confirmar que fechar o convite não bloqueia o fluxo e que mensagens de validação comuns não oferecem relato.
