# Ajustes mobile nos hubs e cabeçalho do Pessoas 360°

## Objetivo
Melhorar a experiência mobile nas telas de hub (Cadastro, Documentos, Comunicação, Rotina, Geral) e corrigir o corte do subtítulo do cabeçalho.

## Problemas
1. **Subtítulo do cabeçalho cortado no mobile**: a descrição abaixo do título da tela usa `line-clamp-1` no mobile, ocultando parte do texto (ex.: "Gerencie colaboradores, unidades, cargos e salários,...").
2. **Cards de subtelas muito altos**: o ícone fica em uma linha e o título/descrição em outra, desperdiçando altura e impedindo que mais cards apareçam na tela sem rolagem.

## Solução

### 1. Cabeçalho com quebra de texto no mobile
- Em `src/components/dp/DpPage.tsx`, alterar o parágrafo de descrição do `DpPageHeader` para permitir quebra de linha no mobile.
- Remover `line-clamp-1` da versão mobile e garantir `break-words`/`leading-snug` para não extrapolar a largura.
- Manter o comportamento atual no desktop (sem truncamento).

### 2. Cards de subtelas mais compactos
- Em `src/components/dp/NavigationCard.tsx`, reorganizar o layout para ícone e título ficarem na mesma linha horizontal.
- A descrição continua abaixo, mas com altura reduzida (`line-clamp-1` no mobile, `line-clamp-2` no desktop) para manter o card estreito.
- A seta (`ArrowRight`) fica alinhada à direita da linha do título.
- Reduzir padding interno no mobile (`p-3` vs `p-5`) para caber mais conteúdo.

### 3. Grid de cards no mobile
- Em `src/components/dp/DpGroupCards.tsx`, ajustar o grid para exibir mais cards por linha no mobile, aproveitando a altura reduzida.
- Proposta: `grid-cols-1` mantido, mas com cards menores; ou `grid-cols-2` em telas um pouco maiores (`sm:`), conforme já existe.

## Arquivos envolvidos
- `src/components/dp/DpPage.tsx`
- `src/components/dp/NavigationCard.tsx`
- `src/components/dp/DpGroupCards.tsx`

## Critérios de aceitação
- O subtítulo do cabeçalho mobile quebra em várias linhas sem cortar texto.
- Os cards de subtelas mostram ícone + título na mesma linha.
- A altura dos cards diminui, permitindo visualizar mais cards sem rolagem.
- Nenhuma regressão no desktop; layout atual é preservado em telas maiores.
