# L01: isolamento dos testes e bloqueio de validações incompletas

Esta alteração separa testes remotos dos testes unitários, exige identificação explícita de um projeto de teste diferente de produção e bloqueia a aprovação quando a infraestrutura ou a cobertura obrigatória está incompleta.

## Alterações

- Configuração própria de integração com preflight de URL, referência do projeto, empresas e credenciais. Conexões PostgreSQL de catálogo são verificadas separadamente do cliente HTTP.
- Endereços fixos de produção removidos das suítes remotas. Fixtures negativas usam campos válidos e verificam negação de permissão, evitando aprovar falhas causadas por dados inválidos.
- Release obrigatório exige relatório novo, testes executados e nenhuma asserção pulada, pendente ou reprovada. Não aceita filtros de execução parcial.
- Restauração exige banco local descartável identificado por nome e comentário, antes de operações destrutivas. Origem e destino não podem coincidir.
- Etapas obrigatórias falham sem pré-requisitos; sincronização de migrations é distinta de verificação estática.
- Lockfile regenerado para permitir instalação reprodutível das dependências declaradas.

## Evidências e limites

### Ausência de valores e herança por unidade — revisão atual

TypeScript strict concluído com zero erros (antes: 12; linha de base: 82). Foram preservados os contratos nullable de analytics e jornadas, impedidas ações de regras sem identificador e de folgas sem data, e o resumo contábil informa quando a quantidade de dias está ausente. Horários próprios sem UUID são distinguidos por seus horários no resumo, sem inventar identificadores persistidos.

As duas RPCs de distribuição de folgas aceitam NULL explícito como todas as unidades, confirmado por consulta somente leitura ao corpo das funções no Lovable Cloud. Um adaptador de tipos restrito a essas duas chamadas mantém o cliente autenticado e não altera os tipos gerados das funções. Testes de transporte confirmam tanto unidade específica quanto NULL.

A opção Seguir a empresa falhava porque dp_config_dp.ferias_adiantamento_13 era NOT NULL, embora dp_ferias_config já resolvesse herança com COALESCE. A migração 20260918010000 permite NULL apenas nas unidades, mantendo a política da empresa obrigatória por CHECK. Aplicada somente em homologação; os três campos Row/Insert/Update foram sincronizados com essa estrutura. A migração deve acompanhar a publicação do código; a funcionalidade em produção continua dependendo dessa aplicação.

Validação: 124 testes dirigidos aprovados, zero falhas; teste SQL transacional na homologação aprovou herança, exceção, retorno a NULL e rejeição de NULL na empresa, com ROLLBACK dos dados temporários. Nenhuma escrita em produção. A suíte completa não foi repetida nesta revisão; a execução anterior e sua oscilação de desempenho permanecem registradas abaixo.

Advisors de segurança executados na homologação: permanecem avisos de funções SECURITY DEFINER executáveis, extensões em public e proteção de senhas, além da tabela auxiliar com RLS sem política. Esses achados não equivalem a aprovação de segurança; nenhuma política ou permissão foi ampliada nesta migração. Credenciais do CI, E2E e restauração comprovada continuam pendentes.


### Parâmetros opcionais de RPC — revisão atual

A consulta somente leitura ao catálogo de funções do Lovable Cloud confirmou DEFAULT NULL para 58 argumentos alterados em 16 arquivos. Quando não há valor, essas chamadas agora omitem o argumento, preservando o padrão do servidor e respeitando os tipos gerados. Os dois parâmetros obrigatórios de unidade em DpFolgas continuam pendentes; não receberam essa transformação. Não houve alteração de funções, schema ou dados de produção.

TypeScript strict passou de 70 para 12 erros. A execução completa local teve 1.758 testes, 1.757 aprovados e uma falha no teste de desempenho de re-render da DRE. A repetição isolada dessa suíte passou nos 12 casos, com média de 358,6 ms no teste que havia falhado; a oscilação permanece registrada, sem declarar a execução completa aprovada. Um teste de transporte com fetch simulado confirmou que PostgREST omite undefined e preserva zero, false, string vazia e null explícito, sem acesso à rede.

As evidências detalhadas estão no diretório local de homologação: rpc-null-defaults-verified.json, typecheck-rpc-defaults.txt e unit-rpc-defaults-results.json. Credenciais não integram o PR. Ainda faltam os 12 erros, credenciais do CI, parametrização E2E e execução comprovada da recuperação; o release não está aprovado.


### Correções pontuais de tipagem após o primeiro CI

TypeScript strict caiu de 82 para 70 erros, sem novos diagnósticos. O parser de expressões mantém o acumulador numérico após validar a entrada; a ordenação usa diretamente o callback opcional; documentos pessoais preservam os tipos de data e texto sem coerção estrutural; alterações de endereço emitem strings; o panorama aceita ausência de dia já tratada pelo código; o formulário de troca volta a texto vazio ao concluir. Não foram alterados argumentos de RPC nem regras do banco. Sete suítes dirigidas passaram com 85 testes e zero casos pulados. Os 70 erros restantes continuam impedindo afirmar aprovação integral.

Quarenta testes de proteção passaram localmente. A configuração YAML do workflow foi validada, e o verificador obrigatório recusou o relatório real de integração incompleta. A instalação npm ci sem scripts e o build foram executados na cópia de preparação anteriormente. O build no Windows gerou um import MCP inválido; esse arquivo foi restaurado e não faz parte do diff.

Na homologação independente, a suíte RLS mais recente teve 284 aprovações, 12 falhas pela ausência do relatório do executor PostgreSQL isolado e 26 casos pulados por falta de conexão/runtime. Dez cenários de pré-admissão passaram em transação revertida; quatro chamadas HTTP paralelas produziram uma conclusão e três respostas idempotentes. Essas evidências parciais não aprovam o release.

A linha de base inicial de TypeScript strict apresentava 82 erros; a contagem atual está registrada acima. Recuperação de backup, CI remoto completo, fluxos positivos de Storage e integrações externas continuam pendentes. Nenhuma alteração de banco em produção integra este PR. As correções de políticas aplicadas na homologação permanecem fora deste pacote.

## Antes de aprovar o merge

### Diagnóstico do primeiro CI remoto

O job unitário executou 1758 casos: 1757 passaram e um falhou por uso de fs.globSync indisponível no Node 20. A guarda agora percorre os diretórios com readdirSync e exige arquivos reais; seus dois testes passaram localmente. O job de recuperação falhou na instalação de postgresql-client-17: foi adicionada a configuração assinada do repositório oficial PostgreSQL APT, conforme https://www.postgresql.org/download/linux/ubuntu/.

Tenancy não recebeu nenhuma das credenciais obrigatórias. E2E apresentou sessão ausente e dependência PIL ausente; a inspeção também identificou quatro arquivos Python ainda referenciando produção. O runner agora bloqueia esses arquivos antes de iniciar subprocessos. Isso é uma pendência de parametrização, não um teste aprovado. A recuperação ainda precisa ser executada após a instalação e configuração do banco.

Executar os jobs obrigatórios com infraestrutura e credenciais de homologação, reconciliar migrations e produzir o relatório do executor isolado. Revisar os resultados do teste de recuperação, sem tratar reconstrução de catálogo como restore de backup. Resolver os bloqueios de qualidade e verificar que o artefato MCP publicado contém imports válidos.
