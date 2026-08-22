# Conferência de Competência: Alertas por Unidade no Lote Completo

## Contexto

A Conferência da Competência (`DocConsistenciaPanel.tsx`) já agrupa pendências por **tipo de documento + competência + problema** (faltando/inconsistente). Quando todos os elegíveis estão pendentes, exibe uma única linha de "lote completo pendente" com a contagem total de colaboradores.

Em empresas com várias unidades, é comum importar o documento para uma unidade e esquecer outra. O alerta global de "lote completo" não indica **onde** ainda falta, e o alerta parcial lista dezenas de nomes sem separação por unidade.

## Comportamento desejado

Dentro de cada tipo de documento + competência, separar as pendências por **unidade**:

- **Lote completo em uma unidade** → uma linha por unidade:
  `Folha de Ponto · 06/2026 — lote completo pendente na Unidade Pakerê Centro (8 colaboradores)`
- **Falta parcial em uma unidade** → linha da unidade com os nomes que faltam:
  `Folha de Ponto · 06/2026 — Unidade Pakerê Lapa: 2 de 5 pendentes — João, Maria`
- **Colaboradores sem unidade** → agrupados em uma linha "Sem unidade", seguindo a mesma regra completo/parcial.
- **Documento sem pendência em nenhuma unidade** → não aparece.

A regra vale para os dois grupos do quadro, mas o conceito de "lote completo" só se aplica ao grupo **Falta Importar**. No grupo **Inconsistência de Cadastro**, a separação por unidade é puramente organizacional (lista de nomes da unidade).

## Detalhes técnicos

Arquivo: `src/components/dp/documentos/DocConsistenciaPanel.tsx` (apenas apresentação/derivação, sem alterar schema ou dados).

1. **Consulta**: incluir `unidade_id` na seleção de `dp_colaboradores` e buscar `id, nome` de `dp_unidades` da empresa para montar um mapa `unidade_id → nome`.
2. **Alertas**: manter o objeto de alerta com `colaborador_id`, `nome`, `tipo`, `problema` e adicionar `unidade_id`.
3. **Agrupamento**: trocar a chave de grupo de `${problema}-${tipo}` para `${problema}-${tipo}-${unidade_id || "sem-unidade"}`.
4. **Elegíveis por unidade**: contar, para cada combinação `(tipo, unidade_id)`, quantos colaboradores ativos daquela unidade têm o item marcado no cadastro (`possui_folha_ponto` / `optante_adiantamento`).
5. **Completo por unidade**: `pendentes.length === elegiveisDaUnidade && elegiveisDaUnidade > 0`. Só aplicar ao problema `faltando`.
6. **Renderização**:
   - Mostrar o nome da unidade no label da linha.
   - Quando completo: `lote completo pendente na <Unidade> (N colaborador[es])`.
   - Quando parcial: `<Unidade>: N de M pendentes` + nomes (ou `N com inconsistência` no grupo Inconsistência).
   - Colaboradores sem unidade usam o rótulo "Sem unidade".
7. **Mobile**: manter o empilhamento atual; o nome da unidade pode ocupar a linha inteira acima dos badges/nomes para não comprimir a largura.
8. **Estado local de expansão**: a chave de `aberto` segue a nova chave de grupo `${problema}-${tipo}-${unidade_id}`.

## Escopo

- Apenas frontend: alteração em `DocConsistenciaPanel.tsx`.
- Nenhuma migração de banco, RLS, edge function ou hook novo.
- Preservar o comportamento de "ver mais / ver menos" de nomes e a responsividade existente.
