## Causa raiz (confirmada no banco)

Não é bug de renderização do relatório: são **3 linhas reais em `categories`** vinculadas por engano à empresa atual em `category_companies`, cujo **pai pertence a outra empresa** do mesmo usuário. Por isso elas aparecem em **todos** os pontos que leem as categorias da empresa — Fluxo de Caixa, formulário de lançamentos e conciliação.

| Categoria | Pai | Empresa do filho | Empresa do pai | Lançamentos |
|---|---|---|---|---|
| Aluguel | DESPESAS | empresa atual | outra empresa | 0 |
| Comissão - RedFox | RECEITAS | empresa atual | outra empresa | 0 |
| Comissão - SuitPay | RECEITAS | empresa atual | outra empresa | 0 |

No Fluxo de Caixa o motor promove essas categorias a raiz (o pai não está no escopo), daí a numeração estranha. Na tela `/categorias` elas ficam penduradas na árvore do pai de outra empresa, por isso você não as encontra no cadastro.

Varredura completa: apenas 5 casos assim no banco (3 na empresa atual, todos sem lançamentos; 2 em outra empresa, com lançamentos).

## O que fazer

### 1. Migração de correção de dados
- 3 casos da empresa atual (sem lançamentos): remover o vínculo indevido em `category_companies` com a empresa atual, mantendo a categoria só na empresa do pai. Somem do Fluxo de Caixa, do formulário de lançamentos e da conciliação.
- 2 casos da outra empresa (com lançamentos): vincular também o **pai** àquela empresa, corrigindo a hierarquia sem perder histórico.

### 2. Prevenção (trigger)
Trigger em `category_companies` (e em `categories` no update de `parent_id`) que rejeita vínculo quando o pai não está vinculado à mesma empresa — impede reincidência via cadastro, importação ou seed.

### 3. Ajuste defensivo no relatório
Em `src/pages/relatorios/FluxoCaixa.tsx`, filtrar `is_active = true` na consulta de categorias (hoje ausente), alinhando com `/categorias`. O fallback "pai ausente vira raiz" no motor continua como rede de segurança.

## Verificação
- Reexecutar a consulta de auditoria: nenhuma categoria com pai fora da empresa.
- Conferir os três pontos: `/relatorios/fluxo-caixa`, formulário de novo lançamento e conciliação Open Finance — as três categorias não devem mais aparecer.
- Conferir `/categorias` para garantir que nada legítimo sumiu.
