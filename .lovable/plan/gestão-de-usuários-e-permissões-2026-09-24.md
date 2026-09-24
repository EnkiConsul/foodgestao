# Gestão de Usuários e Permissões

## Objetivo
Cadastrar usuários com convite por WhatsApp e e-mail. Definir perfil, módulos, empresas e permissões por empresa, com proteção na tela e no banco.

## Etapa 1 — Estrutura no banco (precisa da sua autorização)
- Novos perfis: Dono, Administrador, Gerente, Assistente Financeiro, RH/DP, Colaborador, Contabilidade e Visualizador.
- Módulos por usuário e por empresa: Financeiro, Pessoas 360° e Menu Conta.
- Matriz por item com os níveis: Sem acesso, Consulta, Inclusão, Alteração e Total.
- Opções confidenciais: ver saldos e ver salários.
- Convites passam a guardar nome (em CAIXA ALTA), WhatsApp obrigatório, e-mail opcional, perfil, empresas e matriz.
- Uma função segura no banco (`tem_permissao`) confere a permissão do usuário na empresa.
- A mudança é reversível. Os membros atuais mantêm o acesso que têm hoje.

## Etapa 2 — Convite e primeiro acesso
- Envio do link por e-mail (se houver) e WhatsApp (link pronto para abrir o WhatsApp com a mensagem).
- Página do convite: a pessoa cria a senha e entra pelo WhatsApp ou pelo e-mail.
- O link vale uma vez e expira em 7 dias.

## Etapa 3 — Telas
- Lista de usuários com perfil, empresas e situação (ativo, convite pendente, bloqueado).
- Formulário "Novo usuário": nome, WhatsApp, e-mail e perfil.
- Página de permissões com chaves de módulo no topo, escolha de empresas e a matriz por empresa (igual ao modelo Contas Online), com opção de copiar as permissões de uma empresa para outra.

## Etapa 4 — Aplicar as permissões
- Menu, Hub e barra lateral mostram só os módulos liberados.
- Botões Novo, Salvar e Excluir seguem o nível de cada item.
- Saldos e salários ficam escondidos quando a opção está desligada.
- Fase 3 das rotinas do Pessoas 360°: as checagens no banco passam a usar a nova permissão.

## Etapa 5 — Testes
- Testes de acesso por perfil, com bloqueio de tentativas feitas por fora das telas.

## Observação
O projeto tem um congelamento de versão registrado. Confirme se ele já foi liberado para esta construção.
