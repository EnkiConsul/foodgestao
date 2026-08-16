# Sindicato no cadastro do colaborador (cadastro centralizado)

## Situação atual (verificada)

- O módulo de sindicatos já existe em `/dp/cadastros/sindicatos`: sindicato **laboral** é vinculado a **cargos** (`dp_sindicato_cargos`) e o **patronal** a **unidades** (`dp_sindicato_unidades`). Campos do cadastro: nome, CNPJ, WhatsApp, tipo e os vínculos.
- `dp_colaboradores` já tem a coluna `sindicato_id` (FK para `dp_sindicatos`) — hoje nunca preenchida pela tela.
- O formulário do colaborador (`Dados`, `Horário De Trabalho`, `Remuneração`) não tem nada de sindicato.

Nenhuma migração nova é necessária.

## O que será feito

Bloco "Enquadramento sindical" na aba **Dados**, logo abaixo de Cargo/Unidade (é do cargo que vem o sindicato laboral). Um único ponto de verdade: o que for cadastrado aqui aparece imediatamente na tela de Sindicatos, e vice-versa.

### 1. Cargo já tem sindicato vinculado → somente leitura

Mostra o sindicato laboral do cargo com aviso claro: "Este cargo já está vinculado ao sindicato X. Para trocar o vínculo, use a tela de Sindicatos." O campo fica desabilitado e com link "Abrir cadastro de sindicatos". O colaborador é enquadrado automaticamente nesse sindicato (`sindicato_id`).

### 2. Cargo sem sindicato → cadastrar/vincular ali mesmo

Duas opções no mesmo bloco:

- **Vincular um sindicato existente** — seleção entre os sindicatos laborais ativos da empresa; ao confirmar, cria o vínculo `cargo ↔ sindicato` e enquadra o colaborador.
- **Cadastrar novo sindicato** — abre um diálogo com exatamente os mesmos campos da tela de sindicatos (Nome*, CNPJ, WhatsApp, tipo laboral) e já vincula ao cargo selecionado. O registro nasce completo, aparecendo normalmente em `/dp/cadastros/sindicatos` para edição futura.

Mesmo padrão já usado no botão "Novo cargo" do próprio formulário — nada de cadastro paralelo ou incompleto.

### 3. Contexto e avisos

- Quando há sindicato, mostra tipo (laboral/patronal), data-base e a negociação vigente (CCT/ACT, vigência, reajuste) em texto curto, com link para a negociação.
- Também mostra, informativo, o sindicato **patronal** da unidade do colaborador (quando existir) — esse sempre em leitura, pois pertence à unidade.
- Se o cargo não tem sindicato e nenhum foi escolhido, aparece um aviso informativo (não bloqueia salvar).

### 4. Ficha do colaborador

A ficha (ao clicar na linha) passa a exibir "Sindicato" junto de Cargo/Unidade.

## Fora deste escopo

Motor de piso salarial, reajuste obrigatório e contribuição sindical na folha — Fase 5 completa, para quando você quiser retomar.

## Detalhes técnicos

- `src/components/dp/ColaboradorFormDialog.tsx`: campo `sindicato_id` no estado, no insert/update e no snapshot de "alterações não salvas"; bloco de UI na aba Dados com `data-field="sindicato_id"` para o foco automático já existente.
- Novo hook `useSindicatoDoCargo(cargoId, unidadeId)`: lê `dp_sindicato_cargos` (laboral do cargo), `dp_sindicato_unidades` (patronal da unidade) e a negociação vigente em `dp_sindicato_negociacoes`. Reaproveita `useSindicatoContextoUnidade`.
- Novo componente `src/components/dp/SindicatoQuickFormDialog.tsx` com os mesmos campos e validações de `DpSindicatos.tsx` (nome obrigatório, `maskCnpj`, `maskPhone`, dígitos gravados sem máscara), usando `useUpsertDpSindicato` de `useDpCadastros.tsx` e criando o vínculo em `dp_sindicato_cargos`.
- Invalidação das queries `dp_sindicatos`, `dp_sindicato_vinculos`, `dp_cargos` e `dp_colaboradores` após criar/vincular, garantindo que a tela de Sindicatos reflita a mudança na hora.
- Bloqueio de troca do vínculo do cargo é apenas de interface (a tela de Sindicatos continua sendo a dona da alteração); nenhuma mudança de RLS ou schema.
- `src/components/dp/ColaboradorFichaDialog.tsx`: linha "Sindicato".
