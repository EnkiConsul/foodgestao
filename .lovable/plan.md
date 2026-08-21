# Benefícios: uma tela de cálculo no formato da sua planilha

## O problema

Hoje a tela tem três abas e nenhuma delas se parece com o seu controle real:

- **Cálculo mensal** — as calculadoras de VA/VT (o que mais se aproxima da planilha).
- **Vales por colaborador** — lista solta de itens, misturando o VA/VT da ficha do colaborador com atribuições avulsas. Não serve para conferir nada.
- **Catálogo da empresa** — cadastro de benefícios *extras* (plano de saúde, odonto, seguro). Aparece vazio porque VA e VT não moram ali: eles são campos da ficha do colaborador (aba Remuneração). É essa a confusão.

## O que vamos fazer

### 1. Uma única tela de cálculo, igual à planilha

A aba principal passa a ser uma tabela com exatamente as colunas que você usa:

```text
Colaborador | Valor/dia | Dias pagos (ciclo anterior) | Dias trabalhados (anterior) |
Dias a trabalhar (ciclo atual) | Acrescentar | Total de dias a receber | Valor a depositar
```

- Alternador **Vale-alimentação / Vale-transporte** no topo, com mês e unidade.
- **Dias pagos** e **dias trabalhados** do ciclo anterior vêm do sistema (o que foi depositado x ponto/escala/folgas/férias).
- **Dias a trabalhar** vêm da escala publicada, da jornada do colaborador ou das convocações aceitas (intermitentes).
- **Acrescentar**: coluna editável, como na sua planilha, para ajustes manuais (ex.: os 8 dias do Herick). Fica salva por mês/colaborador com quem lançou e uma observação opcional.
- **Total de dias** = dias a trabalhar + (trabalhados − pagos no anterior) + acrescentar. **Valor a depositar** = total × valor/dia.
- Clicar na linha continua abrindo a memória de cálculo com o calendário dia a dia.
- Exportar CSV com as mesmas colunas.

### 2. Fim da aba "Vales por colaborador"

O que era útil ali entra na própria tabela de cálculo (nome, valor/dia, dia de pagamento, avisos de configuração faltando) e no atalho para a ficha do colaborador. A aba deixa de existir.

### 3. Catálogo renomeado e explicado

Vira **"Outros benefícios (plano de saúde, odonto, etc.)"** com um texto curto avisando: *VA e VT são configurados na ficha do colaborador, aba Remuneração — e aparecem na aba de Cálculo.* Assim ninguém procura VA no catálogo.

### 4. Histórico

Aba **Histórico**: os cálculos já fechados por mês, com o total depositado e o que foi acrescentado manualmente, para conferência dos ciclos anteriores.

## Detalhes técnicos

- `src/lib/dp/va-calculo.ts` / `useDpValeCalculadora.tsx`: expor explicitamente `diasPagosAnterior`, `diasTrabalhadosAnterior` e a diferença assinada (hoje só existe `descontos.dias`, sempre negativa — a planilha também soma, caso do Herick).
- Nova tabela `dp_vale_ajustes` (company_id, colaborador_id, tipo va/vt, competência, dias, observação, created_by) com RLS + GRANTs, para a coluna **Acrescentar**.
- Nova tabela `dp_vale_fechamentos` (competência, tipo, total, snapshot das linhas) para a aba Histórico, gravada ao fechar o mês.
- `ValeCalculadora.tsx`: passa de lista de cartões para tabela (com cartões empilhados no mobile), com célula editável de acréscimo.
- `DpBeneficios.tsx`: abas passam a ser **Cálculo mensal**, **Histórico** e **Outros benefícios**; remoção da aba de vales por colaborador e ajuste dos KPIs para usarem o valor projetado.
- `useDpBeneficiosCadastro.tsx`: continua como fonte dos dados da ficha (valor/dia, dia de pagamento, regras de desconto), mas alimentando a tabela em vez de uma lista própria.
- Testes em `vaCalculo.test.ts` para diferença positiva/negativa do ciclo anterior, acréscimo manual e intermitente sem convocação.
