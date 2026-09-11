# Fechar o que ainda ficou incompleto em Pessoas 360°

## Situação

A maior parte do plano recente foi implementada: motivos de ausência, horário do Herick, menu Geral, pendências compartilhadas entre telas, envio múltiplo de documentos, confirmação de trabalho intermitente, campo de nome social, link do portal, ajustes do portal da Karen e a base da auditoria de erros.

Ainda restam estes pontos confirmados no código.

## 1. Convocação fora do prazo

- Trocar a justificativa única do lote por justificativa por dia.
- Permitir repetir a mesma justificativa nos demais dias.
- Manter a publicação totalmente conjunta: nenhum dia será publicado separadamente.
- Continuar recolhendo os dias aprovados e abrir/rolar somente até o dia com problema.

## 2. Atualização automática das pendências

- Manter a regra única já usada por Início, Pendências e Importar.
- Persistir a última apuração para não depender de a tela ficar aberta.
- Atualizar automaticamente às 6h e depois a cada 8 horas.
- Recalcular também após importar, excluir, ignorar, adiar ou resolver uma pendência.
- Preservar o botão Atualizar e a data/hora da última apuração.

## 3. Documentos da rescisão como conjunto

- Criar um vínculo comum para TRCT, demonstrativo, aviso, guias, exames e demais arquivos da mesma rescisão.
- Exibir esses arquivos reunidos em “Documentos da Rescisão” no histórico do colaborador.
- Manter cada arquivo individualmente acessível, sem transformar a pendência nominal em “lote completo”.
- Permitir incluir vários arquivos na mesma rescisão durante a importação múltipla já existente.

## 4. Cadastro pela ficha de registro

- Antes de concluir o cadastro, solicitar ou confirmar vínculo, forma de pagamento, uso de ponto e opção de adiantamento.
- Quando a unidade possuir relógio de ponto, sugerir “ponto ativo”, permitindo ajuste pelo gestor.
- Não concluir silenciosamente com dados que depois gerem pendências incorretas.

## 5. Nome social em todas as telas operacionais

- Aplicar o nome social, quando preenchido, na Rotina do Dia, escalas, listas, avisos, mensagens e demais telas do portal.
- Manter o nome civil em documentos oficiais, ficha de registro, contratos e rescisão.
- Centralizar essa escolha numa única função para evitar diferenças entre telas.

## 6. Desligamento seguido de novo vínculo

- Permitir iniciar um novo vínculo a partir do cadastro inativo, mantendo a mesma pessoa e o acesso ao portal.
- Separar claramente os períodos de cada vínculo para que documentos e pendências usem o vínculo vigente em cada competência.
- Preservar o histórico do vínculo anterior e impedir que pendências antigas sejam atribuídas ao novo vínculo.

## 7. Auditoria de erros completa

- Adicionar a tela de erros também ao backoffice, com visão de todas as empresas para superadministradores.
- Completar a captura das falhas de gravação, funções do sistema e importações; hoje a base e os erros de tela existem, mas a cobertura ainda não é global.
- Incluir filtro de empresa no backoffice e manter agrupamento, contador, primeira/última ocorrência e estados Aberto/Resolvido/Ignorado.
- Traduzir a falha da confirmação de trabalho do intermitente para uma mensagem clara, registrando os detalhes técnicos apenas na auditoria.

## Validação

- Testar convocação com vários dias e erro em apenas um deles.
- Confirmar a mesma pendência nas três telas antes e depois das atualizações automáticas e manuais.
- Importar vários documentos da mesma rescisão e conferir o agrupamento no histórico.
- Criar colaborador por ficha em unidade com relógio e revisar os campos obrigatórios antes da conclusão.
- Conferir nome social nas telas operacionais e nome civil nos documentos oficiais.
- Simular desligamento, novo vínculo e competências anteriores/posteriores.
- Provocar erros controlados de tela, gravação, função e importação e confirmar sua exibição no módulo e no backoffice.

## Detalhes técnicos

- Convocação: substituir o estado único de justificativa em `NovaConvocacaoPlanner` por valores por data, sem alterar a atomicidade da publicação.
- Pendências: materializar a apuração no banco, com acesso por empresa, rotina agendada e invalidação por eventos de documentos e decisões.
- Rescisão: adicionar uma referência de agrupamento aos documentos e usá-la no histórico.
- Ficha: ampliar a revisão e o envio de `FichaRevisaoCard`/`useDpFichaImportacao` com os campos de impacto.
- Nome social: adotar `nomeExibicao` em todos os pontos operacionais.
- Novo vínculo: usar o fluxo de recontratação com períodos vinculados à mesma pessoa, sem reativar o contrato encerrado.
- Erros: reutilizar `DpErros` no backoffice, completar os pontos de captura e manter os detalhes protegidos pelas permissões existentes.
