# Padrão de benefícios: perguntar só quando muda + escolha do alcance

## O que está acontecendo hoje (verificado)

A pergunta "usar estes benefícios como padrão da unidade?" aparece em todo salvamento porque a comparação entre o que está na tela e o padrão já gravado é feita por texto bruto do JSON. O banco devolve o JSON com as chaves em outra ordem (confirmado nos registros gravados das duas unidades), então a comparação nunca coincide — mesmo quando os valores são idênticos. Por isso: salvou na aba Remuneração, perguntou; clicou em Concluir, perguntou de novo.

## Correções

### 1. Só perguntar quando houver diferença real

- Comparar campo a campo, com normalização (texto vazio, `null` e zero tratados como "não informado"; números escritos como texto convertidos antes de comparar).
- Se o conteúdo da tela for igual ao padrão vigente aplicável, nada é perguntado.
- Uma pergunta por salvamento: depois de responder, o conjunto respondido é marcado como "já decidido" enquanto a ficha continuar aberta, então Concluir na sequência não repete.

### 2. Escolha do alcance ao salvar como padrão

O diálogo passa a oferecer quatro opções (a partir da mais específica preenchida):

- **Somente este colaborador** — nada é gravado como padrão.
- **Padrão do cargo** (dentro da unidade selecionada) — vale para novos colaboradores daquele cargo naquela unidade.
- **Padrão da unidade** — vale para todos os cargos da unidade.
- **Padrão da empresa** — vale onde não houver padrão de unidade nem de cargo.

Precedência ao pré-preencher um novo cadastro: cargo+unidade → unidade → empresa. O aviso discreto na aba Remuneração passa a dizer de qual nível veio a sugestão.

### 3. Aviso de equidade

Ao escolher **Somente este colaborador**, aparece um aviso: benefícios diferentes para colaboradores do mesmo cargo/unidade exigem justificativa objetiva (princípio da equidade / isonomia salarial, art. 461 CLT). O aviso é informativo — não bloqueia o salvamento — e a diferença fica registrada apenas na ficha do colaborador.

## Detalhes técnicos

- Migration: adicionar `cargo_id uuid null` (FK `dp_cargos`) em `dp_beneficios_padroes`, substituir o índice único atual por único em `(company_id, coalesce(unidade_id,...), coalesce(cargo_id,...))`, e estender a trigger de isolamento para validar que o cargo pertence à mesma empresa. Sem novas tabelas; GRANTs e RLS existentes permanecem.
- `src/lib/dp/beneficiosPadrao.ts`: `normalizarPadrao()` + `padroesIguais()` para a comparação; `resolverPadrao()` passa a receber `{ unidadeId, cargoId }` com a precedência cargo+unidade → unidade → empresa; helper `nivelPadrao()` para o rótulo da origem.
- `src/hooks/useDpBeneficiosPadrao.tsx`: `select` e upsert incluindo `cargo_id`; chave de busca por (unidade, cargo).
- `src/components/dp/ColaboradorFormDialog.tsx`: `devePerguntarPadrao()` usa `padroesIguais`; ref com a assinatura já respondida na sessão do diálogo; diálogo convertido em seleção de alcance (RadioGroup) com o aviso de equidade na opção "somente este colaborador"; mantém "não perguntar de novo".
- Testes unitários em `src/lib/dp/__tests__/`: normalização/igualdade (incluindo ordem de chaves diferente, como o banco devolve) e precedência de resolução por cargo/unidade/empresa.
