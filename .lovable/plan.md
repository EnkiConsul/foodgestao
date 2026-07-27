## Objetivo

Permitir cadastrar horários para os sete dias da jornada sem disparar o alerta de "Acima de 44 horas", movendo a validação legal para o vínculo do colaborador (folga fixa) ou para a escala (folga variável). Também corrigir a sobreposição do resumo de carga sobre o card de segunda-feira no mobile.

## Estado atual verificado

- `src/lib/dp/jornada-utils.ts` já tem `calcularCargaDia`, `calcularCargaSemanal`, `validarSemana` e `LIMITE_SEMANAL = 44`.
- `src/components/dp/HorariosSemanaEditor.tsx` soma os sete dias e mostra "Acima de 44 horas" em vermelho (bloco `sticky top-0` sem espaço reservado — origem da sobreposição).
- `src/pages/dp/cadastros/DpCadastroJornadas.tsx` usa um `Dialog` de 4 etapas com `max-h-[92vh]`, sem tela cheia no mobile e sem `safe-area-inset-bottom`.
- `dp_colaborador_jornadas` já possui `folga_fixa_semana_override` (aceita nulo) e `dp_jornadas.tipo_escala` já é um enum com `6x1`, `5x2`, `5x1`, `4x2`, `12x36`, `intermitente`, `personalizada`. Não é necessária alteração de banco.

## O que será feito

### 1. Funções de domínio (`src/lib/dp/jornada-utils.ts`)

Centralizar todo o cálculo, sem regra em componente:

- `calcularCargaTotalCadastrada(horarios)` — soma dos dias cadastrados.
- `calcularCargaComFolgaFixa(horarios, diaFolga)`.
- `calcularCargaComFolgas(horarios, diasFolga[])`.
- `simularCargaPorDiaDeFolga(horarios)` — lista ordenada de {dia, carga} para cada dia possível de folga.
- `calcularCargaDaEscala(diasEscalados)` — soma apenas dos dias efetivamente escalados.
- `validarCargaSemanal(carga, limite = 44)` — retorna `{ excede, limite, excedente }`.
- `folgasPorRegime(tipo_escala)` — 6x1 → 1 folga, 5x2 → 2, 5x1 → 1, 4x2 → 2, todos os dias/12x36/personalizada → sem estimativa fixa.
- `cargaEstimadaPorRegime(horarios, tipo_escala)` — para 6x1/5x2 etc., total menos as folgas de maior carga (melhor caso) e menor carga, gerando a faixa estimada; para 12x36 retorna `null` (cálculo por ciclo/plantão da escala).
- `validarSemana` deixa de tratar excesso semanal como erro: mantém apenas erros por dia (entrada/saída inválidas, intervalo maior que o dia, restrição de menores).

### 2. Cadastro de jornada

- O resumo passa a exibir três blocos: **Carga total cadastrada**, **Carga estimada conforme o regime** (quando aplicável) e a mensagem informativa: "Os horários dos sete dias foram cadastrados. A carga semanal efetiva será calculada conforme a folga semanal de cada colaborador."
- Excesso de 44h vira aviso neutro/informativo, nunca erro bloqueante; o botão Continuar/Salvar não é mais travado por isso.
- Bloco expansível "Simular carga por dia de folga" listando o resultado para cada dia (ex.: Folga na segunda 43h59, terça 44h30…).
- Para 12x36, texto explicando que a carga é apurada por ciclo/plantões gerados na escala.
- O campo Regime (tipo de escala) sobe para a etapa da semana, já que agora dirige a estimativa.

### 3. Vínculo do colaborador (`ColaboradorJornadaDialog.tsx`)

- Seletor de folga passa a ter: dias da semana + **"Folga variável conforme escala"** (grava `folga_fixa_semana_override` nulo).
- Com folga fixa: painel imediato com Jornada, Folga semanal e **Carga semanal prevista**; se passar de 44h, alerta visível, mas salvar continua permitido.
- Com folga variável: exibe "Carga semanal calculada conforme a escala", sem número definitivo.

### 4. Escala

O gerador/validação semanal em `/dp/escalas` passa a usar `calcularCargaDaEscala`, considerando apenas dias escalados e ignorando folgas, para checar o limite na semana efetivamente montada.

### 5. Modal mobile sem sobreposição

- `DialogContent` em três áreas: cabeçalho `shrink-0` (título, etapa, progresso, fechar), conteúdo `min-h-0 flex-1 overflow-y-auto`, rodapé `shrink-0` com `padding-bottom: env(safe-area-inset-bottom)`.
- No mobile o cadastro abre em tela cheia (`h-[100dvh] w-screen max-w-none rounded-none`), voltando a modal centralizado no desktop.
- O card de resumo sai do `sticky` e volta ao fluxo normal do conteúdo, sem posição absoluta, margens negativas ou transform. Cards dos dias com `gap` de 12px.
- Conferência visual em 320/360/390/430px.

### 6. Testes

Novo `src/lib/dp/__tests__/jornada-carga.test.ts` cobrindo: 6x1 com sete dias e folga fixa; 5x2 com duas folgas; folga em dia de carga diferente; jornada que atravessa a meia-noite; folga variável (sem carga definitiva); 12x36; carga efetiva abaixo e acima de 44h; desconto correto do intervalo. Mais um teste de componente verificando que o resumo não usa posicionamento sobreposto e que o cadastro dos sete dias não gera erro bloqueante.

## Detalhes técnicos

Sem migração de banco: `folga_fixa_semana_override` nulo já representa folga variável, e "Todos os dias" é representado pelo regime `personalizada` com sete dias cadastrados (nenhum valor novo de enum é criado). Nenhuma regra de cálculo permanece dentro de componentes React.
