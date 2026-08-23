# Unificar as Regras de Folgas em um Único Cadastro

Hoje a aba Regras mostra três blocos separados (Unidade, Descanso Dominical, Folga Dominical/DSR), o que dá a impressão de serem três cadastros independentes. Na prática, os três formam **uma única regra da unidade**. A proposta é apresentar tudo como um só cadastro, com a unidade no topo e a possibilidade de aplicar a mesma regra a várias unidades.

## Como fica

Um único painel "Regras de Folgas da Unidade", dividido internamente por subtítulos (sem cards soltos):

```text
┌ Regras de Folgas da Unidade ─────────────────────────────┐
│ Unidade: [Pakerê Garavelo ▾]  [Regras configuradas] [Limpar] │
│ Contexto sindical: SINDTUR (patronal) · ACT 2026          │
│ Aplicar a mesma regra também em:  ☐ T-63  ☐ Buriti        │
│                                   (não configurada)       │
│ ───────────────────────────────────────────────────────── │
│ Descanso dominical                                        │
│   Base do descanso · Dias negociados · Teto de folgas     │
│ ───────────────────────────────────────────────────────── │
│ Frequência da folga dominical (DSR)                       │
│   Base da regra · Setor comércio · Modelo e frequência    │
│   Regras específicas para mulheres (Art. 386)             │
└───────────────────────────────────────────────────────────┘
```

Mudanças de comportamento:

- O seletor de unidade e o contexto sindical passam a ser o cabeçalho do cadastro, não um card à parte.
- Nova lista de checkboxes "Aplicar a mesma regra também em" logo abaixo, marcando quais outras unidades recebem a mesma configuração ao salvar. Atalhos "Selecionar todas" / "Limpar seleção" e a marca de "ainda não configurada" ao lado de cada unidade.
- O botão Salvar grava a unidade em edição mais as unidades marcadas de uma vez, sem abrir o diálogo intermediário de replicação (o diálogo deixa de ser usado nesta tela).
- O resumo do que será salvo aparece junto ao rodapé do painel ("Será salvo em 3 unidades").
- Alertas de regra menos protetiva (ciência legal) e o histórico de alterações continuam funcionando exatamente como hoje.
- Ao trocar de unidade, a seleção de unidades adicionais é zerada para evitar replicação acidental.

## Detalhes técnicos

- Arquivo principal: `src/pages/dp/cadastros/DpConfiguracoesJornada.tsx`. Substituir os três `<Section>` por um único `DpContentCard` com subtítulos internos e separadores; manter o mesmo estado `form` e as validações atuais.
- `handleSave` passa a chamar `concluirSalvamento(alvosSelecionados)` direto; `saveMany` já aceita a lista de alvos e continua atualizando a retaguarda da empresa (`null`) quando todas as unidades são selecionadas.
- Remover o uso de `ReplicarRegrasDialog` neste arquivo (o componente permanece no projeto para outras telas, se houver uso).
- Manter `CienciaLegalDialog`, o diálogo de "Limpar Regras", o `localStorage` da unidade selecionada e o `RegrasHistoricoPanel` no fim da aba.
- Layout mobile: cabeçalho empilhado, checkboxes em grid de 1 coluna no mobile e 2–3 colunas no desktop.
