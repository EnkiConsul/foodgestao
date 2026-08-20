# Liberar "Telas em Desenvolvimento" para o pakere.adm

## Por que o menu não aparece

O controle vive no painel de super admin, em **Admin → Telas em Desenvolvimento** (`/admin/telas`). Esse painel inteiro só abre para quem tem o papel `super_admin`.

Confirmei no banco: existem apenas dois usuários com `super_admin`, e o usuário logado no preview (dono da Pakerê Pizzaria, o mesmo perfil usado pelo `pakere.adm`) não é um deles — por isso o item nem aparece no menu e a URL direta redireciona.

## O que será feito

1. Conceder o papel `super_admin` ao usuário do `pakere.adm` (registro em `user_roles`).
2. Após isso, ao recarregar a página, aparece o painel administrativo completo na barra lateral, com o item **Telas em Desenvolvimento**.

## Onde usar depois

Em `/admin/telas`:

- Interruptor único no topo: liga/desliga a ocultação de tudo que estiver marcado.
- Abas **Pessoas 360°** e **Portal do Colaborador** com as telas em cartões por grupo de menu.
- Marcar tela por tela, ou usar "Ocultar grupo" para o menu inteiro (quando todas as telas de um grupo ficam marcadas, o menu desaparece por completo).
- Botão **Salvar marcações** ao final.

## Detalhes técnicos

- Uma linha em `public.user_roles` com `role = 'super_admin'` para o `user_id` do `pakere.adm` (`a2c6a888-2c6a-43cc-9d86-15ac433c0214`, dono da Pakerê Pizzaria). Se esse não for o usuário certo, me diga o CPF/nome do cadastro e eu confirmo antes.
- Operação de dados (`INSERT`), sem mudança de schema; nenhuma alteração de código é necessária.
- Observação de segurança: `super_admin` dá acesso a dados de todos os clientes da plataforma (estatísticas, assinaturas, auditoria, reset de dados), não só da Pakerê.
