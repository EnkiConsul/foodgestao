# Ajuste dos botões do documento no celular

Só apresentação, na lista de documentos (Histórico Completo). Nada de regra de negócio, banco ou permissões.

## O que muda

1. O botão do meio da primeira linha passa a exibir **Comprovante** (hoje "Comprov."), já que a linha tem espaço.
2. A segunda linha (Excluir e Substituir) fica **centralizada**, com os dois botões distribuídos de forma equilibrada em vez de "Excluir" à esquerda e "Substituir" ocupando o resto.

Resultado no celular:

```text
[ Ver ]   [ Comprovante ]   [ Baixar ]
        [ Excluir ]   [ Substituir ]
```

## Detalhes técnicos

- `src/pages/dp/DpHistoricoCompleto.tsx` (bloco mobile do card, ~linhas 949-970):
  - `rotulo="Comprov."` → `rotulo="Comprovante"` no `ComprovanteAcaoBotao`.
  - Separar a segunda linha em um contêiner próprio (`flex items-center justify-center gap-2`) com os botões Excluir e Substituir, removendo o `col-span-2`; a primeira linha continua `grid grid-cols-3`.
- Sem alteração no desktop, nos rótulos do portal, nem em `ComprovantePagamentoPanel.tsx`.
