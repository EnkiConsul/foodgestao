# Copiar feriados entre unidades

Hoje cada unidade tem o seu calendário e só existe o atalho "Incluir nacionais". A ideia é poder repetir a lista já montada de uma unidade nas outras, sem redigitar.

## Como vai funcionar

Na aba Feriados da unidade, ao lado de "Incluir nacionais", entra o botão **Replicar para outras unidades**. Ele abre uma janela com:

- a lista das demais unidades da empresa, com caixas de seleção (e um "selecionar todas");
- ao lado de cada unidade, quantos feriados ela já tem;
- duas formas de copiar:
  - **Completar** (padrão): copia só os feriados que faltam, comparando pela regra (mesma data específica, mesmo dia/mês anual, ou mesma regra relativa). Nada é apagado.
  - **Substituir**: apaga o calendário da unidade escolhida e deixa exatamente igual ao desta unidade — com aviso em vermelho e confirmação antes de aplicar.
- resumo depois de aplicar: "3 unidades atualizadas, 18 feriados copiados, 4 já existiam".

Feriados desligados são copiados mantendo o estado desligado.

## Detalhes técnicos

- Novo `ReplicarFeriadosDialog.tsx` em `src/components/dp/unidades/`, aberto pelo `UnidadeFeriadosPanel`.
- `useDpFeriados` ganha a mutation `replicar({ destinos, modo })`:
  - lê os feriados das unidades destino em uma consulta (`in('unidade_id', destinos)`);
  - monta a chave de comparação por tipo (`especifica:data`, `anual:dia-mes`, `relativa:ordinal-dia_semana-mes`);
  - modo `completar`: insert em lote apenas das chaves ausentes;
  - modo `substituir`: `delete` por `unidade_id` nos destinos seguido do insert completo;
  - `company_id` sempre `selectedCompanyId`; RLS já isola a empresa; nenhuma migração é necessária.
- Lista de unidades vem da consulta existente de `dp_unidades` (mesma usada no cadastro), filtrando a unidade atual.
- Invalida `["dp_unidade_feriados"]` ao final.
