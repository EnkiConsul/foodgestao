
# Adicionar Card "Saldos" no painel lateral de Lancamentos

## O que sera feito

Adicionar um card "Saldos" no painel lateral direito (acima do Filtro Rapido), seguindo o modelo da imagem de referencia. O card exibira quatro linhas de informacao financeira:

1. **Saldo Anterior** - saldo inicial do periodo selecionado (valor ja existente como `previousBalance`), com a data do ultimo dia do mes anterior
2. **Saldo do Periodo** - diferenca entre receitas e despesas do periodo (receitas - despesas), com o intervalo de datas do mes selecionado
3. **Saldo Acumulado** - soma do saldo anterior com o saldo do periodo, com a data do ultimo dia do mes
4. **Saldo Atual** - mesmo valor do saldo acumulado, destacado em verde com fonte maior

O card tera um icone de engrenagem e um botao de minimizar (chevron) no cabecalho, seguindo o padrao visual da imagem.

## Detalhes Tecnicos

### Arquivo: `src/pages/Lancamentos.tsx`

**1. Calcular os novos valores no bloco `totals` (useMemo, linhas ~338-353):**

Adicionar ao objeto `totals`:
- `saldoPeriodo`: `allReceitas - allDespesas` (ja existem essas variaveis)
- `saldoAcumulado`: `previousBalance + saldoPeriodo`

**2. Adicionar o card "Saldos" no painel lateral (linhas ~851-858):**

Inserir um novo `Card` antes do card de "Filtro Rapido", com a seguinte estrutura:

```text
+------------------------------------+
| [icone] Saldos              [^]   |
+------------------------------------+
| Saldo Anterior                     |
| 31/01/2026            24.043,18    |
+------------------------------------+
| Saldo do Periodo                   |
| 01 a 28/02/2026       10.327,42   |
+------------------------------------+
| Saldo Acumulado                    |
| 28/02/2026            13.715,76    |
+------------------------------------+
| Saldo Atual                        |
|                       13.715,76    |
+------------------------------------+
```

- Cada linha sera um `div` com borda inferior, contendo titulo (texto pequeno, muted), subtitulo (data, texto menor) e valor alinhado a direita
- Valores positivos em verde (`text-success`), negativos em vermelho (`text-destructive`)
- "Saldo Atual" tera fundo levemente verde e fonte maior/bold
- O card usara o mesmo componente `FilterSection` ou um header com chevron para permitir minimizar
- As datas serao calculadas dinamicamente com base em `selectedMonth` e `selectedYear`

**3. Tambem exibir no Sheet mobile (linhas ~590-597):**

Adicionar o card Saldos acima do FilterPanel dentro do SheetContent para mobile.
