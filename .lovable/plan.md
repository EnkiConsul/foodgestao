

# Exibir apenas um valor na coluna Valor

## O que sera feito

Na coluna "Valor" da tabela de lancamentos, atualmente sao exibidos dois valores: o valor original do lancamento e, abaixo, o valor pago. A alteracao fara com que apenas um valor seja exibido -- sempre o mais recente. A logica sera:

- Se houve pagamento parcial ou total (`amountPaid > 0`), exibir o `amountPaid` (valor pago)
- Caso contrario, exibir o `amount` (valor original)

Isso consolida a coluna em um unico numero, mostrando sempre o valor da ultima alteracao.

## Detalhes Tecnicos

### Arquivo: `src/pages/Lancamentos.tsx`

Na celula de Valor (linhas 740-745), substituir a renderizacao atual:

```tsx
// ANTES (dois valores)
{formatBRL(r.amount)}
{hasDue && r.amountPaid > 0 && (
  <div className="text-[10px] text-muted-foreground">Pago: {formatBRL(r.amountPaid)}</div>
)}

// DEPOIS (valor unico - sempre o mais recente)
{formatBRL(r.amountPaid > 0 ? r.amountPaid : r.amount)}
```

Tambem remover a linha de percentual pago na descricao (linhas 704-706), ja que com um unico valor exibido essa informacao se torna redundante.

