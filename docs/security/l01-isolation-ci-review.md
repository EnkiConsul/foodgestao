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

Quarenta testes de proteção passaram localmente. A configuração YAML do workflow foi validada, e o verificador obrigatório recusou o relatório real de integração incompleta. A instalação npm ci sem scripts e o build foram executados na cópia de preparação anteriormente. O build no Windows gerou um import MCP inválido; esse arquivo foi restaurado e não faz parte do diff.

Na homologação independente, a suíte RLS mais recente teve 284 aprovações, 12 falhas pela ausência do relatório do executor PostgreSQL isolado e 26 casos pulados por falta de conexão/runtime. Dez cenários de pré-admissão passaram em transação revertida; quatro chamadas HTTP paralelas produziram uma conclusão e três respostas idempotentes. Essas evidências parciais não aprovam o release.

TypeScript strict ainda apresenta 82 erros. Recuperação de backup, CI remoto completo, fluxos positivos de Storage e integrações externas continuam pendentes. Nenhuma alteração de banco em produção integra este PR. As correções de políticas aplicadas na homologação permanecem fora deste pacote.

## Antes de aprovar o merge

### Diagnóstico do primeiro CI remoto

O job unitário executou 1758 casos: 1757 passaram e um falhou por uso de fs.globSync indisponível no Node 20. A guarda agora percorre os diretórios com readdirSync e exige arquivos reais; seus dois testes passaram localmente. O job de recuperação falhou na instalação de postgresql-client-17: foi adicionada a configuração assinada do repositório oficial PostgreSQL APT, conforme https://www.postgresql.org/download/linux/ubuntu/.

Tenancy não recebeu nenhuma das credenciais obrigatórias. E2E apresentou sessão ausente e dependência PIL ausente; a inspeção também identificou quatro arquivos Python ainda referenciando produção. O runner agora bloqueia esses arquivos antes de iniciar subprocessos. Isso é uma pendência de parametrização, não um teste aprovado. A recuperação ainda precisa ser executada após a instalação e configuração do banco.

Executar os jobs obrigatórios com infraestrutura e credenciais de homologação, reconciliar migrations e produzir o relatório do executor isolado. Revisar os resultados do teste de recuperação, sem tratar reconstrução de catálogo como restore de backup. Resolver os bloqueios de qualidade e verificar que o artefato MCP publicado contém imports válidos.
