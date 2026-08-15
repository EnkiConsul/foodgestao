# Fase 5 — Sindicatos: piso salarial e reflexo na remuneração

Fases 1 a 4 (Horário de Trabalho, Remuneração, Benefícios e Cargos) estão concluídas. Esta fase fecha o roteiro do DP conectando a convenção coletiva ao cadastro do colaborador.

## Situação atual verificada

- `dp_sindicatos` guarda nome, tipo, CNPJ, data-base e contatos; `dp_sindicato_cargos` e `dp_sindicato_unidades` fazem os vínculos.
- `dp_sindicato_negociacoes` já tem `reajuste_pct`, vigência, PDF e um campo `clausulas` (JSON) que hoje não é preenchido nem lido em nenhuma tela.
- `dp_cargos` já tem `salario_base` e `insalubre_periculoso` (usados desde a Fase 4), mas nada compara o salário do colaborador com o piso da categoria.

## O que será construído

### 1. Cláusulas econômicas na negociação
Na tela de negociações (CCT/ACT), um bloco "Cláusulas econômicas" grava dentro de `clausulas`:
- Piso salarial geral da categoria.
- Pisos por cargo (lista: cargo + valor).
- Percentuais de adicional noturno, insalubridade e periculosidade, quando a convenção definir acima do mínimo legal.
- Valor de referência de vale-alimentação/refeição e desconto máximo permitido.
- Observação livre por cláusula.

Nenhuma coluna nova: tudo dentro do JSON já existente, com leitura tolerante a documentos antigos (sem cláusulas).

### 2. Piso vigente por cargo
Regra pura nova em `src/lib/dp/sindicato-regras.ts`:
- Escolhe a negociação vigente na data (por unidade quando houver, senão a da empresa).
- Resolve o piso do cargo: piso específico do cargo > piso geral > salário de referência do cargo.
- Devolve também os percentuais de adicionais e o teto de desconto de VA da convenção.

### 3. Alerta no cadastro do colaborador
Na aba **Remuneração**:
- Aviso quando o salário informado ficar abaixo do piso vigente da categoria, citando a convenção e a vigência.
- Aviso quando o desconto de vale-alimentação passar do teto da convenção.
- Aviso quando o adicional informado (noturno/insalubridade/periculosidade) for menor que o percentual da convenção, ou quando o cargo é marcado como insalubre/perigoso e nenhum adicional foi informado.
- Seguindo o padrão do módulo, os avisos **não bloqueiam** o salvamento: são orientativos, no mesmo estilo do Advisor de Compliance já existente.

### 4. Visão sintética em Sindicatos
Na tela de sindicatos, cada sindicato passa a mostrar:
- Convenção vigente (documento, vigência, reajuste) ou aviso de convenção vencida/ausente.
- Piso vigente e quantos colaboradores estão abaixo dele, com link para a ficha do colaborador.
- Cargos e unidades vinculados.

## Detalhes técnicos

- Arquivos novos: `src/lib/dp/sindicato-regras.ts` (regras puras) e `src/hooks/useDpSindicatoVigente.tsx` (negociação vigente + pisos por cargo).
- Arquivos alterados: `src/pages/dp/DpSindicatoNegociacoes.tsx` (bloco de cláusulas), `src/pages/dp/DpSindicatos.tsx` (resumo e colaboradores abaixo do piso), `src/components/dp/RemuneracaoFields.tsx` (avisos), `src/components/dp/ColaboradorFormDialog.tsx` (passagem do contexto sindical).
- Sem migração de banco: `clausulas` é JSON já existente e as consultas continuam escopadas por `company_id` conforme as políticas atuais.
- Testes unitários para as regras de piso, vigência e tetos em `src/lib/dp/__tests__`.
