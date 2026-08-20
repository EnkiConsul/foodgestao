# Ajustes no cadastro de colaborador, periculosidade por dia e VT com data de corte

Cinco pontos levantados. O item da hierarquia do vale-alimentação está respondido abaixo (nada muda no banco para responder isso — só passa a ficar visível na tela).

## 1. Periculosidade simulada no valor por dia

Hoje o adicional de risco mostra apenas "R$ x/mês", calculado sobre a base salarial mensal. Para intermitente/diarista (e horista) isso não ajuda.

- No bloco de adicionais, o resumo passa a mostrar, conforme a forma de pagamento:
  - mensalista: `R$ x/mês` (como hoje);
  - diarista/intermitente: `R$ x/mês · R$ y por dia trabalhado`;
  - horista: `R$ x/mês · R$ y por hora`.
- O valor por dia sai da mesma base já usada na "Base de cálculo do dia" (base salarial ÷ base de dias) — 30% sobre o valor do dia, sem cumular com insalubridade (a regra do art. 193, §2º continua valendo).
- Simulação apenas visual no cadastro; a apuração da folha continua usando o percentual vigente já gravado.

## 2. "Etapa X de 3" e botão "Salvar e continuar" na Remuneração

A lista de etapas do rodapé ainda considera só 3 abas (Dados, Horário de Trabalho, Remuneração). Como Remuneração é a última dessa lista, o botão troca para "Salvar" — parecendo ter desaparecido.

- A sequência passa a ter as 5 abas: Dados → Horário de Trabalho → Remuneração → Dependentes → Documentos.
- Rodapé mostra "Etapa X de 5" em qualquer aba.
- "Salvar e continuar" volta a aparecer na Remuneração (avançando para Dependentes) e em Dependentes (avançando para Documentos); só em Documentos o rótulo fica "Salvar".
- A validação por aba continua igual: Dependentes e Documentos não exigem validação de remuneração.

## 3. Atalho para o adicional de tempo de serviço

A tela de regras existe (Cadastros → Adicionais por tempo de serviço), mas não há nada na Remuneração indicando isso.

- Novo bloco "Adicional por tempo de serviço" na aba Remuneração, somente leitura, mostrando:
  - a regra vigente aplicável ao colaborador (por cargo, unidade, sindicato ou empresa) — ciclo, percentual por ciclo e base;
  - o valor estimado hoje conforme a data de admissão, ou "Nenhuma regra cadastrada";
  - link "Configurar regras" para a tela de cadastro.
- Nenhum campo por colaborador: o adicional é regra coletiva, não valor digitado na ficha.

## 4. De quem é o padrão do depósito e da data de corte do VA

Hierarquia (do mais genérico ao mais específico, o mais específico ganha):

```text
Empresa (Configurações do DP)  →  Unidade  →  Cargo  →  Colaborador
```

- **Empresa**: dia de pagamento, dias de antecedência do corte e regras de desconto ficam nas configurações do DP — é o padrão de fábrica.
- **Unidade / Cargo**: entram no padrão de benefícios já existente ("salvar como padrão desta unidade/cargo"), no grupo Vale-alimentação. Hoje esses campos novos não fazem parte do padrão — passarão a fazer.
- **Colaborador**: sobrescreve tudo, para exceções.
- Na tela do colaborador, o bloco de corte ganha a indicação da origem do valor ("padrão da empresa", "padrão da unidade X", "definido para este colaborador") com ação "voltar ao padrão".

## 5. Mesma lógica de corte para o vale-transporte

O VT hoje é fixo: valor por dia × 22 dias, sem dia de pagamento nem desconto por dia não trabalhado.

- Passa a ter o mesmo desenho do VA:
  - dia do pagamento e dias de antecedência do corte;
  - switches "desconta em": falta, folga extra, atestado/licença, férias;
  - dias previstos vindos da escala publicada (ou jornada habitual), já sem as folgas marcadas no calendário;
  - resumo do período (corte, cobertura, conferência) na tela do colaborador;
  - desconto legal de até 6% do salário continua aplicado sobre o bruto apurado.
- Nova aba "Calculadora de VT" em Benefícios, espelhando a de VA: filtros de mês e unidade, totais, detalhe por colaborador e exportação CSV.
- Os novos campos de VT entram no padrão de benefícios (grupo Vale-transporte), com a mesma hierarquia do item 4.

## Detalhes técnicos

- `src/components/dp/ColaboradorFormDialog.tsx`: `ABAS` passa a incluir `dependentes` e `documentos`; rodapé usa o índice dessa lista e `abaSeguinte` cobre as 5; validadores por aba inalterados (Dependentes/Documentos sem gate).
- `src/lib/dp/adicionais-risco.ts`: novas funções puras para valor do adicional por dia e por hora; `RemuneracaoFields.tsx` consome no resumo conforme `forma_pagamento`.
- `src/lib/dp/va-calculo.ts`: generalizar em um motor de "vale por dia" reutilizado por VA e VT (mesmas funções de período, dias previstos e descontáveis); `valeTransporteDoMes` em `remuneracao.ts` passa a aceitar os dias apurados.
- Banco: colunas `vale_transporte_dia_pagamento`, `vale_transporte_dias_corte` e `vale_transporte_desconta_*` em `dp_colaboradores`; equivalentes `vt_*` em `dp_config_dp`; tabela `dp_vt_apuracoes` espelhando `dp_va_apuracoes` (com GRANTs e RLS iguais).
- `src/lib/dp/beneficiosPadrao.ts`: acrescentar os campos novos de VA e VT em `CAMPOS_PADRAO` e nos grupos correspondentes.
- `src/hooks/useDpVaCalculadora.tsx` vira genérico (VA/VT) ou ganha um irmão `useDpVtCalculadora`; nova aba em `src/pages/dp/DpBeneficios.tsx`.
- Novo bloco de tempo de serviço reaproveita `useDpAdicionaisTempoServico` e `src/lib/dp/tempoServico.ts` para resolver a regra vigente.
- Testes unitários para o motor compartilhado (VA e VT) e para o adicional por dia/hora.
