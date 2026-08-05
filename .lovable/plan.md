# Corrigir o menu lateral do módulo Pedidos

## Diagnóstico confirmado

O Hub e o menu lateral usam fontes diferentes. O Hub já considera o módulo Pedidos disponível, mas `AppSidebar` ainda associa o módulo `pedidos` diretamente ao componente genérico `ComingSoonMenu`, que imprime “Em breve” de forma fixa.

As páginas operacionais já estão registradas e acessíveis: início, onboarding, central, cardápio, cozinha, expedição, relatórios, integrações e assinatura.

## Implementação

- Criar o menu lateral próprio do **Pedidos 360°**, seguindo o mesmo padrão visual e de navegação dos demais módulos.
- Incluir links para Início, Central de Pedidos, Cardápio, Cozinha, Expedição, Relatórios, Integrações e Configuração da unidade.
- Substituir somente o `ComingSoonMenu` do módulo Pedidos pelo novo menu; CRM e RH continuarão marcados como “Em breve”.
- Manter o menu Conta e o link para o Hub sem alterações.

## Validação

- Abrir `/pedidos` e páginas internas para confirmar o destaque correto do item ativo.
- Verificar o menu expandido e recolhido, sem sobreposição ou rótulos truncados.
- Confirmar que o Hub continua mostrando Pedidos como disponível e que os demais módulos não foram afetados.

## Detalhes técnicos

- Reutilizar os componentes compartilhados `SidebarSection` e `SidebarNavItem` e os ícones já adotados nas páginas do módulo.
- A correção é exclusivamente de navegação/apresentação; não altera trial, contratação, permissões ou dados do backend.