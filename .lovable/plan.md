# Ordenação da lista de colaboradores + clareza do botão de sincronizar

## O que muda

### 1. Nova ordenação da lista (desktop e mobile)

Hoje a lista vem ordenada apenas por nome (ordem alfabética do banco). Passa a seguir esta hierarquia:

```text
1. Admins e gestores ativos  -> por nome
2. Colaboradores ativos      -> por unidade, depois por nome
3. Desligados                -> por unidade, depois por nome
```

- "Admin" usa o perfil de acesso do colaborador (`perfil_acesso`), o mesmo que hoje pinta o badge vermelho na coluna PERFIL.
- Unidade ordena pelo nome da unidade (não pelo id), com quem está sem unidade no fim.
- Comparação de nomes com regras do português (acentos), então "ÁLVARO" fica antes de "ANA".
- Vale para as três abas (Todos / Ativos / Desligados) e para os cartões da versão mobile.
- Nada muda nos filtros ou nas contagens das abas.

### 2. Botão "Sincronizar com o padrão"

O botão existe e funciona, mas o nome não explica o que ele faz. Ele compara **cada colaborador ativo** com o padrão de benefícios vigente (padrão do cargo → da unidade → da empresa) e, para quem estiver divergente, aplica o padrão nos grupos escolhidos (assiduidade, vale-alimentação, vale-transporte, ficha). É a ferramenta que corrige casos como "salvei o colaborador sem vale-alimentação" ou "o máximo de atrasos ficou 5 e o padrão é 3".

Ajustes de clareza (sem mudar o comportamento):

- Rótulo passa a ser **"Sincronizar benefícios"**.
- Tooltip no botão: "Aplica o padrão de benefícios e assiduidade vigente aos colaboradores ativos divergentes".
- Descrição do diálogo reescrita para dizer, em uma frase, que ele lista as divergências e permite deixar exceções de fora antes de aplicar.
- Quando não há divergência, o diálogo já mostra estado vazio; o texto passa a ser explícito: "Todos os colaboradores ativos já estão de acordo com o padrão vigente".

## Detalhes técnicos

- `src/pages/dp/DpColaboradores.tsx`: acrescentar um `sort` no `useMemo` do `filtered`, com chave composta `(grupo, unidade_nome, nome)` — grupo 0 = ativo com `perfil_acesso` admin/gestor, 1 = ativo, 2 = desligado (`!ativo`). Usar `localeCompare(..., "pt-BR")`.
- `src/components/dp/SincronizarPadraoDialog.tsx`: apenas textos (título, descrição, estado vazio). A lógica de `resolverPadrao` / `divergenciasColaboradorVsPadrao` permanece intacta.
- Nenhuma alteração de banco, hook ou consulta.
