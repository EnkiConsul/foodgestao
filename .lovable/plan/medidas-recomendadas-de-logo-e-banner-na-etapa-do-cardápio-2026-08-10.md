# Medidas recomendadas de logo e banner na etapa do cardápio

## Medidas

- **Logo:** quadrada, **512×512 px** (exibida em 64×64 px na loja, recorte `object-cover`). PNG com fundo transparente é o ideal.
- **Banner:** **1600×480 px** (proporção 10:3; altura real 128 px no celular e 176 px no desktop, com recorte). Evite texto perto das bordas.
- Ambos: PNG, JPG ou WEBP, até 3 MB.

## O que muda na tela

Na etapa "Cardápio online" do onboarding de Pedidos, os textos de ajuda abaixo dos campos de imagem passam a informar as medidas exatas:

- Logo: "Quadrada, 512×512 px. PNG, JPG ou WEBP até 3 MB."
- Banner: "Formato largo, 1600×480 px (10:3). PNG, JPG ou WEBP até 3 MB."

Também será corrigido um detalhe técnico no componente de imagem (a propriedade `slug` está declarada duas vezes no tipo), sem mudança de comportamento.

## Detalhes técnicos

- Arquivo: `src/components/orders/onboarding/StepCardapioOnline.tsx` — atualizar as props `hint` dos dois `MediaField` e limpar a duplicação de `slug` na assinatura do componente.
- Nenhuma alteração de backend, upload ou validação.
