# Liberar a rotação da tela no celular

## O que está acontecendo

O aplicativo instalado no celular está configurado para ficar travado em pé (retrato). Por isso, ao virar o aparelho, a tela não acompanha.

## O que vou fazer

1. Remover a trava de orientação, para o app girar junto com o aparelho (em pé e deitado).
2. Ajustar o que muda quando a tela fica deitada:
   - o menu inferior fica mais baixo, para não ocupar espaço da tela deitada;
   - o cabeçalho fica mais compacto;
   - conteúdo continua rolando normalmente e as tabelas ganham rolagem lateral quando necessário.
3. Conferir nas telas mais usadas (início, colaboradores, férias, ponto, portal do colaborador) que nada fica cortado ou sobreposto quando o celular está deitado.

## Observação

Quem já instalou o app no celular pode precisar reabrir (ou reinstalar) para que a nova configuração valha, porque o aparelho guarda a preferência antiga.

## Detalhes técnicos

- `public/manifest.webmanifest`: trocar `"orientation": "portrait"` por `"any"`.
- Revisar alturas fixas e paddings dependentes de `100vh`/`dvh` no shell (`AppLayout`, `DpShell`, `MobileBottomNav`, `AppHeader`/`DpHeader`) usando as variáveis já existentes de `useVisualViewport`, aplicando variantes em landscape curto (`@media (orientation: landscape) and (max-height: 500px)`).
- Verificação com Playwright em viewport 748x407 nas rotas principais, mais `tsgo` e a suíte de testes.
