# Benefícios: cálculo com a lógica da sua planilha

## O problema

A tela tem três abas e nenhuma reflete o seu controle real:

- **Cálculo mensal** — as calculadoras de VA/VT (o que mais se aproxima).
- **Vales por colaborador** — lista solta de itens, sem serventia para conferir o depósito.
- **Catálogo da empresa** — só benefícios *extras*. Aparece vazio porque VA e VT hoje moram apenas na ficha do colaborador (aba Remuneração). É aí que se perde a referência.

## A lógica do cálculo

Para cada colaborador, por tipo de vale:

```text
dias a trabalhar no ciclo atual
  + (dias trabalhados no ciclo anterior − dias pagos no ciclo anterior)
  = total de dias a receber
total de dias × valor por dia = valor a depositar
```

A diferença do ciclo anterior é **sempre calculada pelo sistema** — pode ser negativa (pagou mais do que trabalhou) ou positiva (trabalhou mais do que foi pago, como no caso do Herick). Não existe campo de ajuste manual.

- **Dias a trabalhar**: escala publicada, jornada do colaborador ou convocações aceitas (intermitentes), já descontando folgas semanais, folga dominical e férias.
- **Dias trabalhados no anterior**: ponto/escala do ciclo, descontando falta, folga extra, atestado e férias conforme as regras de VA/VT configuradas.
- **Dias pagos no anterior**: o que o depósito daquele ciclo cobriu.

## O que vamos fazer

### 1. Aba de cálculo mensal reescrita

Uma visão por colaborador (cartões no mobile, tabela no desktop) mostrando, sem jargão:

- valor por dia e dia de pagamento;
- dias do ciclo atual;
- a diferença do ciclo anterior, com sinal e explicação (`+8 dias do ciclo anterior` / `−1 falta`);
- total de dias e valor a depositar;
- clique abre a memória de cálculo com o calendário dia a dia;
- exportar CSV e totais no topo (dias, valor total, colaboradores).

### 2. Fim da aba "Vales por colaborador"

O que era útil ali (valor/dia, dia de pagamento, avisos de configuração faltando, atalho para a ficha) entra na própria visão de cálculo. A aba deixa de existir.

### 3. Catálogo da empresa passa a incluir VA e VT

O catálogo ganha, no topo, os dois itens do sistema — **Vale-alimentação** e **Vale-transporte** — com as mesmas regras que existem hoje na ficha do colaborador:

- periodicidade (diário/mensal), valor por dia, dias considerados;
- desconto (valor ou percentual, respeitando o limite de 6% do VT);
- dia de pagamento e antecedência da data de corte;
- o que desconta: falta, folga extra, atestado, férias.

Essas regras são editáveis ali como **padrão da empresa** (e por unidade/cargo, como os demais itens do catálogo), e continuam editáveis na ficha do colaborador, que prevalece quando preenchida. O admin escolhe por qual tela trabalhar; a origem da regra aplicada fica visível ("padrão da empresa" / "da unidade" / "do colaborador").

Abaixo dos vales seguem os benefícios extras (plano de saúde, odonto, seguro), como hoje.

### 4. Histórico

Aba **Histórico**: ciclos já fechados por mês e tipo, com dias, diferença aplicada e total depositado, para conferência.

## Detalhes técnicos

- `src/lib/dp/va-calculo.ts` / `useDpValeCalculadora.tsx`: expor `diasPagosAnterior`, `diasTrabalhadosAnterior` e a diferença **assinada** (hoje só existe `descontos.dias`, sempre negativa) e somar essa diferença no total de dias.
- Padrões de vale por escopo: reaproveitar o modelo já usado em `dp_beneficios_padroes`/`beneficiosPadrao.ts` para guardar as regras de VA/VT por empresa, unidade e cargo, com RLS + GRANTs na migração; resolução Colaborador → Cargo → Unidade → Empresa consumida pelo motor de cálculo.
- Extrair os campos de regra de VA/VT de `RemuneracaoFields.tsx` para um componente único usado na ficha do colaborador e no diálogo do catálogo (`BeneficiosDialogs.tsx`), evitando duas UIs divergentes.
- `ValeCalculadora.tsx`: nova apresentação com as colunas de dias/diferença/total e CSV correspondente.
- `DpBeneficios.tsx`: abas passam a ser **Cálculo mensal**, **Histórico** e **Catálogo da empresa**; KPIs recalculados com o valor projetado.
- `useDpBeneficiosCadastro.tsx`: segue como fonte dos dados da ficha, alimentando a visão de cálculo.
- Nova tabela `dp_vale_fechamentos` (competência, tipo, total, snapshot das linhas) para o Histórico, com RLS + GRANTs.
- Testes em `vaCalculo.test.ts`: diferença positiva e negativa do ciclo anterior, intermitente sem convocação, e paridade entre a resolução por escopo e a regra do colaborador.
