# Acesso de administrador para sócios (caso Sílvia)

## O que está acontecendo (verificado)

A Sílvia está cadastrada em Pessoas com perfil "Admin" e com login vinculado, mas na empresa Pakere Pizzaria ela não tem nenhum vínculo de administração: não é a titular da conta e não consta na lista de membros da empresa. O único papel gravado para o usuário dela é "colaborador de portal".

O sistema decide entre "área administrativa" e "portal do colaborador" pela lista de membros da empresa (titular / admin / gestor), e não pelo perfil escolhido no cadastro do colaborador. Por isso ela entra sempre no portal, com funções de colaborador.

## Correção

1. Conceder à Sílvia acesso de **administradora da empresa** Pakere Pizzaria, com o mesmo alcance de um admin (Pessoas, Financeiro, cadastros e configurações), mantendo a titularidade da conta com o dono atual.
2. Manter o portal dela funcionando em paralelo: como sócia, ela continua tendo ficha, documentos, férias e folgas próprias. Hoje quem é admin é expulso do portal; passará a poder usar as duas áreas, com um atalho de ida e volta entre "Administração" e "Meu portal".

## Regra geral daqui pra frente (automático com confirmação)

Quando um colaborador for salvo com perfil **Admin** ou **Gestor** e tiver login vinculado, o sistema passa a registrar uma **concessão pendente** de acesso administrativo:

- aparece um aviso em Perfis de Acesso ("Sílvia foi marcada como Admin — conceder acesso administrativo?") com as ações Conceder e Recusar;
- somente titular da conta, admin ou super admin pode confirmar;
- Admin no cadastro propõe acesso de admin da empresa; Gestor propõe acesso restrito ao módulo Pessoas;
- ao remover o perfil Admin/Gestor do cadastro, o sistema propõe (também com confirmação) a retirada do acesso administrativo;
- nada muda sozinho: sem confirmação, o acesso continua sendo apenas o de colaborador.

## Detalhes técnicos

- Dados: inserir `company_members` (company_id `b0d450a7…`, user_id da Sílvia, role `admin`) via `run_sql`; sem alteração de esquema para o caso pontual.
- Nova tabela `dp_acesso_concessoes` (colaborador_id, company_id, user_id, papel proposto, origem, status pendente/concedido/recusado, decidido_por/em), com RLS por empresa: leitura para membros que podem ver Pessoas, decisão restrita a owner/admin/super_admin. GRANTs explícitos para `authenticated` e `service_role`.
- Trigger em `dp_colaboradores` (AFTER INSERT/UPDATE de `perfil_acesso`/`user_id`) cria/cancela a concessão pendente de forma idempotente, sem tocar em `company_members`.
- RPC `dp_acesso_concessao_decidir(id, decisao)` — `SECURITY DEFINER`, `search_path = public`, autorização server-side, empresa derivada do registro, escreve `company_members` e auditoria em uma transação.
- Ajustar `is_dp_colaborador`/`sou_dp_colaborador` para não excluir quem tem ficha ativa só por ser owner/admin, e revisar `ColaboradorShell` e `resolveLandingTarget` para admins com ficha: destino padrão continua a área administrativa, com acesso liberado ao portal.
- Testes: unitários da decisão de destino e do gate do portal; validação das RPCs/trigger em clone descartável com duas empresas sintéticas (isolamento multiempresa e autorização).
- Migration idempotente com rollback documentado; nada é publicado nesta fase.
