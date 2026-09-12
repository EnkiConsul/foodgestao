# Ajuste fino da barra inferior mobile

## Objetivo
Reduzir levemente a altura/espaço vazio da barra de atalhos inferior mobile, ganhando um pouco mais de tela sem comprometer a área de toque dos botões.

## Mudanças
1. Diminuir a altura da barra de `64px` para `56px` (`NAV_HEIGHT`).
2. Ajustar o SVG de fundo (`BottomNavShape`) para a nova altura, reduzindo proporcionalmente o entalhe central e os cantos.
3. Reajustar o alinhamento vertical dos ícones:
   - botão "Início" continua elevado, mas com menos margem negativa;
   - ícones laterais mantêm área de toque mínima de 44px, com padding inferior um pouco menor.
4. Reduzir o `padding-bottom` das telas para não deixar espaço em excesso abaixo do conteúdo:
   - `AppLayout`: `pb-24` → `pb-22`
   - `AdminLayout`: `pb-24` → `pb-22`
   - `DpShell`: `pb-28` → `pb-24`
5. Validar visualmente em viewport mobile (393×830) e garantir que os toques continuam confortáveis.

## Escopo
- Apenas a barra inferior mobile e os espaçamentos de conteúdo que a compensam.
- Nenhuma mudança de funcionalidade, rotas ou backend.
