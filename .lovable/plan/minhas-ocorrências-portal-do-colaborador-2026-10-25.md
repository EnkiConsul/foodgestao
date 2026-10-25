# Minhas Ocorrências — Portal do colaborador

## Objetivo
Dar ao colaborador um lugar claro para consultar suas ocorrências por mês, acompanhar a decisão do gestor e entender o impacto na assiduidade, sem expor informações internas nem prometer pagamento de prêmio antes da apuração.

## 1. Consulta mensal
- Criar **Minhas Ocorrências** no Portal, com mês atual selecionado e navegação para meses anteriores.
- Incluir acesso no menu existente e um atalho em **Minha jornada hoje**, sem duplicar os registros de Meu Histórico.
- Exibir todas as ocorrências próprias do mês: relatadas pelo colaborador, registradas pelo gestor e geradas automaticamente.
- Incluir atrasos, faltas, saídas antecipadas, atestados, divergências, folgas extras autorizadas, compensatórias, trocas e dispensa do aviso pelo Art. 488.
- Ordenar pela data, da mais recente para a mais antiga, com filtros simples **Todas**, **Aguardando análise** e **Analisadas**. Canceladas ficam disponíveis separadamente, sem afetar os totais ativos.
- Mostrar carregamento, mês sem ocorrências e falha de consulta com opção de tentar novamente; nunca apresentar erro como lista vazia.

## 2. Informações de cada ocorrência
- Data, tipo, horário e minutos, quando registrados; previsões permanecem identificadas como previsões.
- Justificativa enviada pelo próprio colaborador e origem do registro; textos escritos pelo gestor só aparecem se houver indicação explícita de comunicação ao colaborador.
- Separar **confirmação do fato**, **análise do gestor** e **impacto na assiduidade**. Confirmada não significa automaticamente justificada ou abonada.
- Usar a decisão efetivamente registrada, sem deduzir aprovação apenas pelo tipo ou pela cor do card.
- Preservar os rótulos unificados de folga compensatória e sua origem; mostrar os dois lados das trocas quando existirem.
- Não expor observações internas, análises privadas, auditoria bruta, dados de colegas ou saldo residual do desligamento.
- Consulta somente leitura nesta entrega: não criar botões novos para aprovar, cancelar ou alterar ocorrências passadas.

## 3. Resumo da assiduidade
- Exibir o resumo apenas para quem possui prêmio de assiduidade aplicável.
- Diferenciar situação em acompanhamento, dentro da tolerância, pendências de decisão e impacto confirmado pelas regras existentes.
- **Não usar “Garantido”** para mês em andamento; apresentar “Sem impacto confirmado até agora” quando essa for a informação disponível.
- Não anunciar “Não elegível” apenas por uma ocorrência pendente, por risco calculado ou por previsão de falta/atraso.
- Folgas autorizadas, compensatórias, trocas e abonos legais preservam seus impactos existentes, sem criar perda de prêmio.
- Não calcular salário, prêmio a pagar ou folha. Se não houver apuração mensal confiável, mostrar impactos e pendências conhecidos, sem inventar um fechamento.
- Meses anteriores não devem ser recalculados silenciosamente com uma regra contratual atual diferente; quando não houver regra histórica/apuração persistida, limitar o resumo às decisões gravadas.

## 4. Integração com Meu Calendário
- Ao abrir um dia, exibir as ocorrências daquela data usando a mesma apresentação da consulta mensal.
- Permitir abrir Minhas Ocorrências no mês/data correspondente sem perder a referência do calendário.
- Mostrar múltiplas ocorrências do mesmo dia, sem substituir detalhes existentes de escala, folgas, férias ou aviso.
- Manter datas antigas consultáveis e refletir decisões feitas em outro dispositivo ao atualizar o Portal.

## 5. Segurança e escopo
- Resolver o colaborador pela sessão autenticada no servidor; nunca aceitar um identificador arbitrário como autorização.
- Retornar somente os campos permitidos para o próprio colaborador e sua empresa/vínculo autorizado.
- Não abrir acesso a documentos médicos, notas internas ou histórico de outros colaboradores para viabilizar a tela.
- Não alterar critérios de assiduidade, concessão de folgas, desligamento, planos, cobranças ou flags comerciais.
- Pertence ao módulo **Pessoas 360°**; a consulta de ocorrências não cria dependência comercial nova de Escala.
- Não reintroduzir Ponto/Folha/Rescisões nem criar termo de folga compensatória.

## Detalhes técnicos
- Criar a página em `/dp/meu/ocorrencias`, respeitando as guardas e a navegação compartilhada do Portal.
- Criar consulta própria de histórico por intervalo mensal, sem remover o recorte usado para registrar ocorrências de hoje em `useMinhasOcorrencias`.
- Usar apresentação compartilhada entre a página e o detalhe do calendário, reutilizando os rótulos de `ocorrencias.ts`.
- Fazer leitura por RPC autenticada com lista explícita de campos seguros, sem ampliar políticas de leitura de tabelas internas; verificar e corrigir eventuais acessos diretos equivalentes que contrariem a confidencialidade. A consulta atual já pede `assiduidade_observacao`: retirar essa exposição e conferir no servidor se o acesso direto permite recuperar notas internas. Ocultar no card não basta; preservar as leituras autorizadas do gestor ao proteger o Portal.
- Buscar o mês completo com paginação quando necessário, aplicando período e filtros antes do limite. Evitar recorte de “hoje em diante” no histórico.
- Reutilizar regras existentes de assiduidade sem duplicar o motor; verificar a existência de apuração/regra histórica antes de implementar o resumo mensal.
- Compartilhar invalidação de consultas após decisões, atualização ao retornar à tela e atualização periódica compatível com o Portal.
- Usar componentes e cores semânticas existentes; manter seleção de mês e ações acessíveis em telas estreitas.

## Validação e entrega
- Testar isolamento entre colaboradores/empresas e ausência de campos confidenciais na resposta, com dados fictícios em ambiente isolado.
- Testar meses anteriores, virada de mês, paginação, várias ocorrências no dia, previsões, cancelamentos e atestados, sem duplicar ocorrências vinculadas.
- Testar confirmação sem análise, impacto pendente, tolerância, prêmio não aplicável e preservação dos impactos das folgas/trocas/Art. 488.
- Validar início → Minhas Ocorrências → mês anterior e calendário → detalhe do dia, em computador e celular, com sessão de colaborador autorizada.
- Não alterar fichas reais de colaboradores para testes. Se não houver sessão adequada, informar a limitação em vez de afirmar validação completa.
- Entregar para revisão na prévia; **não publicar** sem autorização explícita.