## Objetivo

Reformular a tela **Regras de Folgas** (`/dp/folgas/configuracoes/regras`): regras por unidade de loja, acordo coletivo com dias negociados, seletor único de frequência dominical, e remoção do bloco "Sábados, feriados e menores".

---

## 1. Regras por unidade de loja

Hoje existe **uma única configuração por empresa** (`dp_config_dp` tem chave única em `company_id`). Passa a existir:

- **Regra da empresa (padrão)** — vale para todas as unidades.
- **Exceções por unidade** — cada loja pode sobrescrever **todo o conjunto** de regras de folgas.

Na tela: um seletor no topo — "Regra aplicada a: **Todas as unidades (padrão)** / Unidade X / Unidade Y". Ao escolher uma unidade sem exceção, aparece "Criar exceção para esta unidade" (parte dos valores do padrão); com exceção, aparece "Remover exceção e voltar ao padrão". Um badge indica quando a unidade está herdando o padrão.

A resolução no motor (escala automática, validação de folgas, conformidade DSR, portal do colaborador) passa a ser: **regra da unidade do colaborador → senão regra da empresa**.

## 2. Base do descanso dominical e dias negociados

- O campo **"Acordo / convenção vinculada"** só aparece quando a base for **Acordo coletivo** (hoje aparece sempre).
- No modo acordo, novo campo **"Dias de descanso negociados"**: multi-seleção de domingo a sábado. Folga em qualquer dia marcado conta como DSR negociado.
- No modo legislação: domingo estrito, sem campos de acordo.
- A conformidade DSR passa a contar folgas nos dias negociados da unidade do colaborador.

## 3. Frequência da folga dominical — um único modelo

Substituir "Modo da folga dominical" + "Domingo de folga a cada (semanas)" por um seletor de **modelo de frequência** com dois modos mutuamente exclusivos:

- **A cada X semanas** — campo de semanas (3 = padrão do comércio, 7 = demais setores).
- **X domingos por mês** — campo mensal, incluindo a opção "1 a cada 2 meses".

Escolher um modo oculta o campo do outro — nunca os dois ativos. A **mesma estrutura** se aplica ao bloco de **mulheres (Art. 386 CLT)**: modo próprio + valor próprio.

Os alertas de "menos protetiva" e o diálogo de ciência legal continuam, normalizando os dois modos para uma base comparável antes de comparar com o padrão legal.

## 4. Remoção do bloco "Sábados, feriados e menores"

- **Política de sábado**: removida da tela. O tratamento do sábado passa a vir exclusivamente da escala/jornada cadastrada do colaborador (6x1, 5x2, 12x36 etc.), que já define os dias de trabalho.
- **Política de feriado trabalhado**: removida por ora — voltará junto com o módulo de Relógio de Ponto, que é quem terá o dado de feriado efetivamente trabalhado.
- **Validar restrições para menores de 18 anos**: sai de Regras de Folgas e passa para a tela de **Jornadas e Escalas** (`/dp/cadastros/jornadas`), que é onde a trava atua (turno noturno 22h–5h, cargos insalubres/perigosos, carga horária).

Com isso a tela de Regras de Folgas fica com: Descanso Dominical → Folga dominical (DSR) → Férias → Histórico.

---

## Detalhes técnicos

**Banco**
- `dp_config_dp`: adicionar `unidade_id uuid null` referenciando `dp_unidades`; trocar a unicidade de `company_id` por `unique (company_id, unidade_id)` mais índice único parcial para a linha padrão (`unidade_id is null`).
- Novas colunas: `dias_descanso_negociados smallint[]` (0=dom…6=sáb, default `{0}`), `modo_frequencia_domingo text` (`semanas` | `por_mes`), `domingos_por_mes numeric`, e equivalentes para mulheres.
- `politica_sabado` e `politica_feriado`: deixam de ser editáveis e são removidas do payload do app; as colunas permanecem no banco (com default) para não quebrar histórico — o feriado volta a ser usado no módulo de Ponto.
- `exige_validacao_menor`: coluna mantida (a trigger `dp_validar_jornada_menor` depende dela); muda apenas o local de edição na UI.
- Função `dp_config_resolvida(_company_id, _unidade_id)` (SECURITY DEFINER) devolvendo a regra efetiva com fallback para o padrão; usada pelas triggers de validação de folgas e pelo gerador de escala. GRANTs e RLS espelhando as políticas já existentes de `dp_config_dp`.

**Frontend**
- `src/lib/dp/dsr-rules.ts`: substituir `ModoDomingo`/`periodicidadeDoModo` pelo modelo de frequência de 2 modos, adicionar `frequenciaParaSemanas`, aceitar `diasNegociados` em `avaliarConformidade`, remover `PoliticaSabado`/`PoliticaFeriado` do tipo de formulário; atualizar `src/lib/dp/__tests__/dsr-rules.test.ts`.
- `src/hooks/useDpConfigDp.tsx`: carregar padrão + exceções por unidade, expor `unidadeSelecionada`, `criarExcecao`, `removerExcecao`; histórico em `dp_regras_historico` registrando a unidade afetada.
- `src/pages/dp/cadastros/DpConfiguracoesJornada.tsx`: seletor de unidade, acordo condicional, multi-seleção de dias, seletor de frequência de 2 modos, remoção do bloco de sábados/feriados/menores. Mobile em coluna única, sem rolagem lateral.
- `src/pages/dp/cadastros/DpCadastroJornadas.tsx`: novo card com o toggle "Validar restrições para menores de 18 anos".
- `src/pages/dp/DpConformidadeDsr.tsx` e `src/lib/dp/escala-generator.ts`: consumir a regra resolvida pela unidade do colaborador.
