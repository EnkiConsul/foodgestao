# Pendências de Documentos Agrupadas por Documento + Competência

## Problema

No quadro de pendências da tela de Importação (Conferência da Competência), cada colaborador gera uma linha própria. Quando um documento não foi importado para ninguém, a tela vira uma lista enorme de nomes repetindo o mesmo tipo de documento.

## Comportamento desejado

Agrupar a pendência por **tipo de documento + competência**, e só nomear colaboradores quando a falta for parcial:

- **Falta para todos os elegíveis** → uma única linha:
  `Folha de Ponto · 06/2026 — lote completo pendente (18 colaboradores)`
- **Falta para parte deles** → uma linha do documento com os nomes que faltam:
  `Folha de Ponto · 06/2026 — 3 de 18 pendentes: Cristiane, João, Maria`
  Quando a lista de nomes for longa, mostrar os primeiros e um "+N" que expande ao clicar.
- **Documento sem nenhuma pendência** → não aparece.

A mesma regra vale para os dois grupos do quadro:
- **Falta Importar** (documento esperado pelo cadastro e não importado)
- **Inconsistência de Cadastro** (documento importado com o item desativado no cadastro) — aqui também agrupado por documento, nomeando só quando for parcial.

## Detalhes técnicos

Arquivo: `src/components/dp/documentos/DocConsistenciaPanel.tsx` (mudança apenas de apresentação/derivação, sem tocar em dados ou schema).

1. Após montar os alertas existentes, derivar um agrupamento por `tipo` + `problema`:
   - `elegiveis`: total de colaboradores ativos com o item marcado no cadastro (`possui_folha_ponto` / `optante_adiantamento`);
   - `pendentes`: colaboradores do grupo;
   - `completo = pendentes.length === elegiveis && elegiveis > 0`.
2. Renderizar uma linha por grupo, com badge do tipo, competência formatada (`MM/AAAA`), contagem e — só quando não for completo — os nomes.
3. Nomes: mostrar até 6 e um botão "+N" que alterna a exibição completa (estado local por grupo).
4. Mobile: linhas empilhadas, nomes em `flex-wrap`, sem rolagem horizontal.
