# Ajustes do comprovante no celular e no portal

## 1. Cinco ações em duas linhas (histórico de documentos no celular)

Hoje o card mostra Ver / Baixar / Substituir / Excluir em duas colunas e o botão de comprovante cai sozinho numa terceira linha, esticado e sem texto.

Novo arranjo, duas linhas:

```text
[ Ver ]        [ Baixar ]      [ Comprovante ]
[ Substituir ]                 [ Excluir ]
```

- Grade de 3 colunas: primeira linha Ver, Baixar e Comprovante; segunda linha Substituir (ocupando 2 colunas) e Excluir.
- O botão de comprovante ganha rótulo curto "Comprov." com o ícone, para não ficar um bloco vazio, e mantém a altura de toque atual (44 px).
- Quando o documento não é de pagamento, o espaço da terceira coluna fica vago e Substituir/Excluir continuam alinhados — sem linha extra.
- Nada muda no desktop nem em qualquer outra tela.

## 2. Portal do colaborador: ícone só quando há comprovante

- No card do documento, o botão "Comprovante de pagamento" já aparece somente quando existe arquivo anexado — mantido.
- Nos detalhes do documento no portal, o bloco de comprovante deixa de ser exibido quando não há comprovante (hoje mostraria o aviso "A empresa ainda não anexou..."). Assim o colaborador nunca vê indício de comprovante inexistente.
- No lado da empresa nada muda: continua mostrando "Sem comprovante" e o botão de importar.

## Detalhes técnicos

- `src/pages/dp/DpHistoricoCompleto.tsx`: bloco mobile (~linhas 949-969) passa a `grid-cols-3`, com `col-span-2` em Substituir; ordem reordenada para Ver, Baixar, Comprovante, Substituir, Excluir.
- `src/components/dp/documentos/ComprovantePagamentoPanel.tsx`: `ComprovanteAcaoBotao` aceita `rotulo?: string` para exibir texto opcional ao lado do ícone; `ComprovantePagamentoPanel` retorna `null` quando `somenteLeitura && !comprovante.tem`.
- Sem mudanças de banco, permissões, regras de pendência ou contratos de dados.
