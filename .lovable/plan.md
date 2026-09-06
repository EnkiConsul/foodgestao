# Rotina do dia: registro manual de trabalho e cards padronizados

## 1. Registrar que alguém trabalhou, mesmo depois do dia

Hoje só é possível registrar quem **não** é colaborador cadastrado (teste/folguista). Falta o caso da Alessandra: intermitente cadastrada que trabalhou em 05/09 sem convocação enviada.

No mesmo diálogo "Adicionar Pessoa" passa a existir a escolha de quem trabalhou:

- **Colaborador cadastrado** — escolhe a pessoa na lista (nome vem do cadastro), unidade, cargo (já sugerido pelo cadastro dela), dia (ou período) e horário (já sugerido pelo horário mais usado no cargo/unidade).
- **Pessoa não cadastrada** — o fluxo atual de teste/folguista, sem mudança.

Regras:

- Data limitada a hoje ou dias passados; para o futuro o caminho segue sendo convocação/escala.
- O registro soma no card do tipo da pessoa: intermitente em "Convocados Aceitos", demais em "Fixos Escalados". Na lista do dia aparece a etiqueta **Registro manual** com observação, e o gestor pode editar ou remover.
- Não cria convocação, folga, ponto nem folha — é registro de rotina.
- Se a pessoa já estiver contada no dia (convocação aceita, escala publicada, folga, férias ou atestado), o sistema avisa e não deixa duplicar.

## 2. Cadastrar pessoa a partir do calendário do mês

Ao clicar num dia no calendário da rotina do mês, a janela do dia passa a ter o botão "Adicionar Pessoa", já com aquela data preenchida (o mesmo diálogo do item 1).

## 3. Cards em 2 linhas e altura padronizada

- Os 8 cards da rotina do dia ficam em 2 linhas de 4 (grade mais compacta, também dentro da janela aberta pelo calendário do mês).
- "Atestado/Licença" passa a "Atestado / Licença" para permitir quebra de linha.
- Todos os cards ficam com a mesma altura, mesmo quando o título ocupa só uma linha.

## Detalhes técnicos

- Migração (a partir de M29): em `dp_pessoas_avulsas`, adicionar `colaborador_id uuid` (FK `dp_colaboradores`), permitir `nome` nulo quando houver `colaborador_id`, novo valor `registro_manual` no enum `dp_pessoa_avulsa_tipo`, check garantindo exatamente uma origem (nome livre XOR colaborador) e índice parcial evitando dois registros manuais da mesma pessoa no mesmo dia. Sem alterar migrations antigas; GRANTs/RLS já existentes revisados para o novo campo.
- `operacao-panorama.ts`: `contarDia` passa a tratar avulsos com `colaborador_id` como presença do colaborador, classificando em `convocado_aceito` (intermitente) ou `fixo`, com `origem: "registro_manual"` em `PessoaPanorama` e sem dupla contagem quando já há convocação/escala/ausência. `CATEGORIA_LABEL.atestado` → "Atestado / Licença".
- `useDpOperacaoPanorama`: `PessoaAvulsaInput` ganha `colaborador_id`; `salvarAvulsa` grava a nova coluna; leitura resolve nome/cargo do colaborador.
- `DpPessoaAvulsaDialog`: seletor de origem, campo de colaborador com busca, `max` da data = hoje para registro manual, validação em `pessoaAvulsaSchema` (`src/lib/validations.ts`).
- `DpOperacaoPanorama.tsx`: `GradeCards` com `grid-cols-2 md:grid-cols-4` e `items-stretch`; `DpStatCard` com `h-full` e título em duas linhas fixas; botão "Adicionar Pessoa" no cabeçalho da janela do dia (`DetalheDiaOperacao`) passando a data clicada.
- Testes: novos casos em `src/lib/dp/__tests__/operacao-panorama.test.ts` (registro manual conta no card certo, não duplica, respeita período) e teste SQL do check/índice em `supabase/tests`. Rodar typecheck, lint e vitest de DP.
