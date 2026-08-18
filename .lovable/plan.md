# Ordenação da lista de colaboradores + remoção do botão de sincronizar

## O que muda

### 1. Nova ordenação da lista (desktop e mobile)

Hoje a lista vem ordenada apenas por nome. Passa a seguir esta hierarquia:

```text
1. Admins e gestores ativos  -> por nome
2. Colaboradores ativos      -> por unidade, depois por nome
3. Desligados                -> por unidade, depois por nome
```

- "Admin" usa o perfil de acesso do colaborador (`perfil_acesso`), o mesmo que hoje pinta o badge vermelho na coluna PERFIL.
- Unidade ordena pelo nome da unidade, com quem está sem unidade no fim.
- Comparação de nomes com regras do português (acentos), então "ÁLVARO" fica antes de "ANA".
- Vale para as três abas (Todos / Ativos / Desligados) e para os cartões da versão mobile.
- Nada muda nos filtros ou nas contagens das abas.

### 2. Remover o botão "Sincronizar com o padrão"

O botão aplicava, em lote, o padrão de benefícios/assiduidade vigente a todos os colaboradores ativos divergentes — o que sobrescreve exceções negociadas individualmente. Ele sai da tela.

O que continua existindo (e é o caminho seguro):

- O aviso de divergência dentro da ficha do colaborador, na aba Remuneração, que mostra o que está diferente do padrão e permite alinhar **aquele** colaborador.
- A tela de padrões de benefícios, onde o padrão é definido por cargo/unidade/empresa e aplicado no momento em que o gestor decide.

O componente do diálogo em lote e a ação em lote são removidos do código, para não voltarem por engano.

## Detalhes técnicos

- `src/pages/dp/DpColaboradores.tsx`: acrescentar `sort` no `useMemo` do `filtered` com chave composta `(grupo, unidade_nome, nome)` — grupo 0 = ativo com `perfil_acesso` admin/gestor, 1 = ativo, 2 = `!ativo`; usar `localeCompare(..., "pt-BR")`. Remover o botão, o estado `sincronizarOpen`, o import e a renderização do diálogo.
- Excluir `src/components/dp/SincronizarPadraoDialog.tsx`.
- Remover `useSincronizarPadraoColaboradores` de `src/hooks/useDpBeneficiosPadrao.tsx` (sem outros consumidores). As funções de comparação (`divergenciasColaboradorVsPadrao`, `resolverPadrao`) continuam, pois são usadas pelo aviso dentro da ficha.
- Nenhuma alteração de banco.
