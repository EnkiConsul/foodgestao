# Isonomia: mostrar o padrão do grupo no formato em que ele foi cadastrado

## O problema

O aviso diz "Padrão do grupo: R$ 528,00/mês", mas os colegas têm o vale-alimentação
cadastrado como **R$ 24,00 por dia** com base de 22 dias. O motor converte tudo para valor
mensal para poder comparar, e o aviso está exibindo essa conversão como se fosse o valor
cadastrado. O número não está errado (24 × 22 = 528), mas não é a linguagem do cadastro e
faz o gestor duvidar do alerta.

Efeito colateral do mesmo problema: o botão "Aplicar como os colegas" hoje grava o
vale-alimentação como **mensal R$ 528,00** em vez de **diário R$ 24,00**, o que muda o
comportamento do benefício em meses com mais ou menos dias trabalhados.

## O que muda

1. O padrão do grupo passa a ser exibido na periodicidade predominante do grupo, sem
   conversão para mês quando o padrão é diário (dias trabalhados variam por colaborador,
   inclusive por convocação):
   - grupo diário: `Padrão do grupo: R$ 24,00/dia`
   - grupo mensal: `Padrão do grupo: R$ 528,00/mês`
2. A mesma frase é usada nos três lugares: banner da aba Remuneração, diálogo de
   confirmação ao salvar e mensagem de divergência de valor.
3. "Aplicar como os colegas" passa a copiar a configuração nativa do grupo
   (periodicidade + valor unitário), não o valor mensal convertido.
4. Divergência de valor: quando o cadastro e o grupo usam a mesma periodicidade, a
   comparação e o texto ficam no valor unitário (R$ 22,00/dia contra R$ 24,00/dia). Só
   quando as periodicidades diferem o motor cai para o equivalente mensal, e o texto diz
   explicitamente que é uma estimativa mensal.


## Detalhes técnicos

- `src/lib/dp/isonomia-snapshot.ts`: o snapshot de cada colega passa a carregar, além de
  `valorMes`, os campos nativos do benefício (`valorUnitario`, `periodicidade`).
- `src/lib/dp/beneficios-regras.ts`:
  - `ColegaIsonomia.beneficios` ganha os campos nativos opcionais.
  - `DivergenciaIsonomia` ganha `padrao_unitario` e `padrao_periodicidade`, derivados da
    configuração predominante entre os colegas que recebem (mesma lógica de moda já usada em
    `valorPredominante`, aplicada ao par valor+periodicidade).
  - Nova função `descreverPadraoGrupo(divergencia)` devolve a frase única usada pela UI, sem
    projeção mensal quando a periodicidade é diária.
  - Comparação de valor: se `padrao_periodicidade` é igual à do cadastro, compara unitário
    contra unitário; se diferem, compara o equivalente mensal e o texto sinaliza estimativa.
- `src/components/dp/BeneficioIsonomiaAviso.tsx` e
  `src/components/dp/BeneficioDispensaDialog.tsx`: trocam o `formatarBRL(valor_padrao)/mês`
  pela nova frase.
- `src/components/dp/ColaboradorFormDialog.tsx`: `aplicarPadraoIsonomia` usa
  `padrao_periodicidade`/`padrao_unitario` do grupo (fallback para mensal quando o grupo não
  tiver configuração nativa conhecida), mantendo os dias base já configurados no cadastro.
- `src/test/unit/`: teste cobrindo grupo diário (24/dia) — a divergência deve reportar
  unitário 24 diário sem citar dias no mês, e o "aplicar padrão" deve produzir diário 24.

