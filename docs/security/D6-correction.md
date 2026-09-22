# D6 — Correção aplicada em produção
Data: 21/09/2026 (America/Sao_Paulo; migrações geradas em 22/09 UTC).

## Resultado
Corrigido o excesso de acesso confirmado em ocorrências e caminhos associados de RH.
Aplicação direta, transacional, via conector Lovable ao projeto ceeb4a17-6191-46b0-a351-c97a8211c03e, após testes no Supabase de homologação utjhzpdbqzajrhnzcher.
Os arquivos SQL registram exatamente as alterações executadas. O conector Lovable não registra automaticamente estas execuções no histórico supabase_migrations; coordenar a sincronização com o deploy do repositório. As alterações são reaplicáveis.

## Alterações
- Cinco políticas: leitura de ocorrências, eventos, coberturas e solicitações; criação de solicitações por membros. Vínculo simples deixa de conferir acesso administrativo.
- Preservadas políticas existentes de acesso do próprio colaborador.
- Sete RPCs: complementar, confirmar, analisar, classificar, tratar, cancelar e indicadores. Administração exige admin/owner; ações próprias de escrita exigem colaborador ativo.
- Duas funções internas deixam de ser executáveis diretamente por anon/authenticated; chamadas internas por funções/triggers privilegiados continuam.
- Revogado TRUNCATE de PUBLIC, anon e authenticated em todas as tabelas dp_*.
- Corrigidas incompatibilidades anteriores nos enums do fluxo de atestados: solicitação aprovada/recusada/cancelada; férias não possuem recusado e folgas não possuem recusada.

## Verificação
Teste SQL com transação e rollback, somente com empresas/usuários fictícios existentes em homologação:
- Consulta e usuário de outra empresa: sem leitura da ocorrência, histórico e solicitação.
- Os mesmos dois perfis: sete RPCs negadas.
- Administrador: leituras e ações testadas autorizadas.
- Colaborador ativo: acesso à própria ocorrência e complemento autorizados.
- Administrador bloqueado: sem leitura de ocorrências.
- Aprovação, recusa e cancelamento de atestado: triggers executados sem os erros de enum encontrados.
- Ausência de EXECUTE direto nas duas funções internas e de TRUNCATE para clientes.
- Consulta posterior: zero ocorrências/solicitações/vínculos temporários remanescentes.

Produção, verificação de catálogo sem consultar pessoas reais:
- 0 políticas amplas entre as cinco alteradas.
- 0 RPCs amplas/anônimas entre as sete alteradas.
- 0 grants TRUNCATE efetivos para anon/authenticated em dp_*.
- Duas funções internas sem EXECUTE para authenticated.
- 3 buckets de RH continuam privados.

## Limites
Esta entrega corrige o achado D6-01 e os caminhos descritos; não certifica integralmente D6.
Administradores/proprietários preservam o acesso previsto no modelo atual. Ainda não foi criada uma permissão distinta para documentos médicos, separada da administração da empresa.
Permanecem pendentes: matriz de autorização médica/RH, testes HTTP de emissão/expiração de URLs assinadas, revisão integral de referências cruzadas, logs/exportações e definição de finalidade/base legal/retenção.
Não foram lidos documentos reais, excluídos dados de produção nem executados testes sintéticos em produção.

## Advisors de homologação
Persistem avisos anteriores fora desta alteração: tabela de teste com RLS sem policy, extensões no public, quatro outras funções SECURITY DEFINER executáveis por anon, funções privilegiadas autenticadas e proteção de senhas vazadas.
Referências:
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
