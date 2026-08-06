# Etapa "Página do Cardápio" — loja online própria do 360°FOOD

## O que entendi

Hoje o onboarding de Pedidos tem 4 etapas e o único campo relacionado a cardápio na unidade é um link externo (`external_menu_url`). A ideia é o próprio sistema gerar a página pública da loja, em vez de depender de plataforma de terceiros.

Confirmado com você:
- A página é **vitrine + pedido online**: o cliente vê produtos e preços, pode pedir pelo WhatsApp **ou** montar carrinho e finalizar — nesse caso o pedido cai direto na Central de Pedidos.
- Personalização por **temas prontos** (3 modelos) + logo, cor e banner.
- Link em **slug no domínio do sistema** (`gestor360food.com/c/minha-loja`) com **QR code** para imprimir.
- Entra como **nova etapa no Onboarding** de Pedidos.

## Como fica o onboarding

```text
1. Cadastre sua operação
2. Configure sua unidade
3. Prepare o recebimento
4. Publique seu cardápio online   <-- nova etapa
5. Teste e abra a unidade
```

Na nova etapa o lojista:
- escolhe o endereço da loja (slug sugerido a partir do nome, com verificação de disponibilidade em tempo real);
- escolhe um dos 3 temas e ajusta logo, cor principal, banner e texto de boas-vindas;
- define o WhatsApp de pedidos e liga/desliga o carrinho online (pedido direto);
- vê um preview lado a lado (desktop/celular) com os produtos reais do cardápio;
- publica, copia o link e baixa o QR code em PNG para imprimir na mesa/balcão.

Depois do onboarding, essa mesma configuração fica disponível como aba **Página pública** na tela de Cardápio, para editar quando quiser.

## A loja pública (`/c/:slug`)

Página aberta, sem login, rápida e mobile-first:
- capa com logo, nome, status aberto/fechado (usa os horários já cadastrados), tempo de preparo e endereço;
- cardápio navegável por categorias, com produtos, fotos, descrições, preços e complementos;
- produto indisponível aparece esgotado (respeita disponibilidade por unidade);
- botão de produto abre a ficha para escolher complementos e quantidade;
- carrinho com resumo, escolha de retirada/entrega, taxa de entrega pela zona cadastrada, forma de pagamento entre as habilitadas na unidade, e campo de observação;
- ao finalizar: nome + telefone do cliente, confirmação e tela de acompanhamento do pedido pelo código;
- botão flutuante de WhatsApp como alternativa ao carrinho;
- se a loja estiver fechada ou fora do horário, mostra aviso e bloqueia o envio (mantendo a vitrine visível);
- SEO próprio: título, descrição, dados estruturados de restaurante e link canônico.

## Detalhes técnicos

**Banco**
- Nova tabela `ped_storefronts`: `unit_id`, `slug` (único), `theme`, `primary_color`, `logo_url`, `banner_url`, `headline`, `about`, `whatsapp_phone`, `online_cart_enabled`, `is_published`, `published_at`, timestamps. RLS por empresa para escrita/gestão + GRANTs para `authenticated`/`service_role`.
- Bucket público `ped-storefront` para logo e banner.
- RPCs `SECURITY DEFINER` para o público (sem expor as tabelas ao papel `anon`):
  - `storefront_public_get(p_slug)` — devolve loja, tema, horários, zonas, formas de pagamento e cardápio completo (categorias, produtos, variações, complementos, disponibilidade), só se `is_published`;
  - `storefront_public_create_order(...)` — valida horário, itens, preços recalculados no servidor, taxa de entrega e mínimo do pedido; cria `ped_orders` com `channel = 'app'`/loja própria, itens, opções e pagamento; devolve o código do pedido;
  - `storefront_public_track_order(p_slug, p_code, p_phone)` — status do pedido para acompanhamento.
- Preços e totais **nunca** vêm do cliente: são recalculados dentro da RPC a partir do catálogo.
- Rate limit por IP/telefone na criação de pedido para evitar abuso.
- Trigger para manter `external_menu_url` da unidade apontando para o link próprio quando publicado.

**Frontend**
- Rota pública `/c/:slug` fora do layout autenticado, com `StorefrontPage` + componentes `StorefrontHeader`, `MenuCategoryList`, `ProductSheet`, `CartDrawer`, `CheckoutForm`, `OrderTracking`.
- 3 temas como presets de tokens semânticos (`src/lib/orders/storefrontThemes.ts`) — sem cores hardcoded nos componentes.
- Estado do carrinho em `localStorage` por slug, para não perder ao recarregar.
- Nova etapa `StepCardapioOnline.tsx` em `src/components/orders/onboarding/`, incluída em `ONBOARDING_STEPS` e no cálculo de progresso; item de checklist "cardápio publicado".
- Geração do QR code no cliente e download em PNG.
- Novo item no checklist e no `HelpHint` da etapa, seguindo o padrão de ajuda já existente no módulo.

**Escopo desta fase**
Inclui: configuração, publicação, loja pública, carrinho, pedido entrando na Central e acompanhamento. Não inclui: domínio próprio do lojista, cupons na loja pública, login de cliente e pagamento online (pagamento é registrado como combinado na entrega/retirada).
