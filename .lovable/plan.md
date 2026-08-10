# Cores da marca extraídas da logo

Hoje a etapa do cardápio mostra 6 cores fixas como sugestão de "Cor principal". A ideia é que, depois de enviar a logo, as opções passem a ser as cores da própria logomarca.

## Como vai funcionar

- Ao enviar (ou já existir) uma logo, o sistema lê a imagem no navegador e extrai as cores predominantes.
- Aparece uma linha nova: **"Cores da sua logo"** com até 6 amostras clicáveis, ordenadas pela frequência na imagem.
- Cores muito claras/escuras e quase-cinzas são descartadas (não servem como cor de destaque); tons parecidos entre si são agrupados para não repetir.
- Se a extração não encontrar nada usável (logo preto e branco, por exemplo), a linha não aparece e continuam valendo as sugestões padrão.
- A paleta padrão e o seletor de cor personalizada permanecem, como alternativa.
- Nada é salvo automaticamente: a cor só muda quando o usuário clica em uma amostra.

## Detalhes técnicos

- Novo utilitário `src/lib/orders/logoPalette.ts`: recebe uma URL de imagem, desenha em `<canvas>` reduzido (~64×64), quantiza os pixels em buckets, ignora pixels transparentes, filtra por luminância e saturação mínimas, agrupa por distância de cor e retorna hex ordenados por peso.
- Novo hook `useLogoPalette(url)` (no mesmo arquivo ou em `src/hooks/useLogoPalette.ts`) usando react-query com cache pela URL; a URL assinada da logo já vem de `useStorefrontMediaPreview`.
- `StepCardapioOnline.tsx`: obter o preview assinado da logo no nível do componente (hoje ele fica dentro de `MediaField`), passar para o hook e renderizar o novo grupo de amostras acima dos `COLOR_PRESETS`. Sem mudanças de schema, RPC ou validação.
