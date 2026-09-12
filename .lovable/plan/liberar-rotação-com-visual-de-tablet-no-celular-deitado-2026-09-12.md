# Liberar rotação com visual de tablet no celular deitado

## O que está acontecendo

O aplicativo instalado no celular está configurado para ficar travado em pé (retrato). Por isso, ao virar o aparelho, a tela não acompanha.

## O que vou fazer

1. Remover a trava de orientação, para o app girar junto com o aparelho (em pé e deitado).
2. Quando um celular for colocado na horizontal, ativar automaticamente o visual de tablet:
   - esconder a barra inferior do celular;
   - mostrar o menu lateral recolhido, deixando mais espaço para o conteúdo;
   - usar tabelas, filtros e organização de tela da versão tablet;
   - manter o visual mobile atual quando o aparelho voltar à posição vertical.
3. Conferir nas telas mais usadas (início, colaboradores, férias, ponto, portal do colaborador) que nada fica cortado ou sobreposto quando o celular está deitado.

## Observação

Quem já instalou o app no celular pode precisar reabrir (ou reinstalar) para que a nova configuração valha, porque o aparelho guarda a preferência antiga.

## Detalhes técnicos

- `public/manifest.webmanifest`: trocar `"orientation": "portrait"` por `"any"`.
- Criar uma regra responsiva compartilhada que trate como tablet as telas com largura de tablet **ou** celulares em landscape curto (`orientation: landscape` e `max-height: 500px`).
- Alinhar a regra do Tailwind, `useIsMobile` e os gestos mobile para que barra inferior, sidebar, tabelas e cartões mudem juntos, sem uma interface híbrida.
- Revisar alturas dependentes de `100vh`/`dvh` nos shells usando a variável já existente de `useVisualViewport`.
- Verificação com Playwright em 407x748 (celular em pé), 748x407 (mesmo celular deitado) e tablet, nas rotas principais, mais testes direcionados.
