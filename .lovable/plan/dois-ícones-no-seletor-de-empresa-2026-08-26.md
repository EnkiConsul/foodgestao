# Dois ícones no seletor de empresa

## Causa

Em `src/components/layout/ContextSelector.tsx` o ícone aparece duas vezes:

1. O gatilho (`SelectTrigger`) desenha um ícone próprio (`Building2` para PJ, `User` para PF).
2. O `SelectValue` reproduz o conteúdo do item selecionado — e cada `SelectItem` também inclui o mesmo ícone.

Resultado: prédio + prédio antes do nome "IMPULSO CAP...".

## Mudança

- Manter o ícone apenas no gatilho (ele também mostra o estado de sincronização com o spinner).
- Nos itens da lista, manter o ícone (ajuda a distinguir "Pessoal" de empresas) mas envolvê-lo em um elemento que o `SelectValue` não replica: passar o texto puro via `SelectItem` com `textValue`/`<SelectItemText>` apenas para o nome, e marcar o ícone como decorativo fora do texto do item.

Efeito visual: um único ícone no gatilho, lista inalterada.

## Detalhe técnico

`SelectValue` clona o conteúdo do `SelectItem` selecionado. Reestruturar o `SelectItem` para que somente o nome fique dentro do texto do item, deixando o ícone fora dele — sem mudanças de dados ou lógica de contexto.
