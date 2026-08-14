# Cadastro de colaborador: vínculo, adiantamento e turno

Três ajustes no fluxo de cadastro do colaborador.

## 1. Tipo de vínculo volta vazio na edição

Causa confirmada: a tabela de colaboradores não guarda `tipo_vinculo` — só o campo `regime` (valores em minúsculo: `clt`, `intermitente`, `pj`, `estagio`, `temporario`, `mei`). Ao editar, o formulário converte o regime para maiúsculas (`INTERMITENTE`), que não corresponde a nenhuma opção da lista (`Intermitente`), e o campo aparece vazio.

Correção: criar o mapa reverso regime → rótulo do vínculo e usar na abertura do formulário. Como vários rótulos (Sócio, PJ, Autônomo) compartilham o regime `pj`, o mapa reverso escolhe "PJ" como rótulo canônico.

## 2. Intermitente não tem adiantamento quinzenal

O trabalhador intermitente é pago por convocação, sem salário mensal fixo — adiantamento quinzenal não se aplica.

Correção: acrescentar a regra `permiteAdiantamento` à política de contrato (`src/lib/dp/contrato-policy.ts`): verdadeiro para CLT/estágio/temporário, falso para intermitente (e também para PJ/MEI, que não têm folha). No formulário:
- Esconder a opção "Opta por Adiantamento Salarial" quando o vínculo não permitir, exibindo no lugar uma nota curta explicando o motivo.
- Não pré-marcar a opção pela configuração da unidade nesses casos e salvar sempre `false`.

## 3. Turno dentro do cadastro do colaborador

Hoje a configuração de trabalho só lista turnos já cadastrados em Turnos; se a empresa não cadastrou nenhum, o usuário fica travado. Duas saídas, sem sair da tela do colaborador:

- **Criar turno na hora**: botão "Novo turno" ao lado do seletor de turno padrão (e no seletor de turno por dia). Abre o formulário de turno já existente, pré-preenchido com a unidade do colaborador; ao salvar, o turno é criado e selecionado automaticamente. Estado vazio do seletor passa a convidar a criar o primeiro turno em vez de apenas dizer "Nenhum turno cadastrado".
- **Copiar de outro colaborador**: botão "Copiar de outro colaborador" no topo da configuração de trabalho. Lista os colaboradores ativos da mesma unidade que já têm configuração vigente (nome, cargo e resumo do turno/dias) e, ao escolher um, preenche turno padrão, dias trabalhados, turnos por dia e folga variável — o usuário ainda revisa e salva.

## Detalhes técnicos

- `src/components/dp/ColaboradorFormDialog.tsx`: `REGIME_TO_VINCULO` aplicado no `useEffect` de carga; adiantamento condicionado a `policy.permiteAdiantamento`.
- `src/lib/dp/contrato-policy.ts`: novo campo `permiteAdiantamento` em `ContratoPolicy` + casos no teste `src/lib/dp/__tests__/contrato-policy.test.ts`.
- `src/components/dp/ColaboradorConfigTrabalhoDialog.tsx`: integra `TurnoForm` via `useDpTurnos().criar` (invalida a lista e seleciona o novo id) e um novo `CopiarConfigColaboradorDialog` que lê as configurações vigentes por `useDpColaboradorConfigTrabalho`.
- Sem mudanças de banco de dados.
