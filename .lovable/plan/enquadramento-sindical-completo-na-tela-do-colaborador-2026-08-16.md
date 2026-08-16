# Enquadramento sindical completo na tela do colaborador

## Situação atual (verificada)

- No bloco "Enquadramento Sindical" da aba **Dados**, o sindicato laboral do cargo já é preenchido automaticamente (`useSindicatoDoCargo` + efeito que grava `sindicato_id`), mas o patronal só aparece como uma linha de texto no rodapé do bloco, e só quando existe.
- O diálogo rápido (`SindicatoQuickFormDialog`) cria apenas o sindicato **laboral** com Nome, CNPJ, WhatsApp e Data-base — deixando contato (nome/e-mail) e o patronal para a tela de Sindicatos.
- `dp_sindicatos` tem: nome, cnpj, tipo, data_base, contato_nome, contato_email, contato_telefone, ativo. Vínculos: `dp_sindicato_cargos` (laboral↔cargo) e `dp_sindicato_unidades` (patronal↔unidade).

## O que muda

### 1. Laboral já vinculado: nada para escolher

Quando o cargo tem sindicato, o bloco mostra apenas o resultado — nome, CNPJ, data-base e negociação vigente — como informação enquadrada, sem select nem ação de troca. Continua com o aviso de que a troca é feita na tela de Sindicatos e o link para lá.

### 2. Patronal com o mesmo peso do laboral

O bloco passa a ter duas seções lado a lado: **Laboral (do cargo)** e **Patronal (da unidade)**.

- Patronal já vinculado à unidade: exibido preenchido e em leitura, com CNPJ, data-base e negociação vigente.
- Unidade sem patronal: mesma dupla de ações do laboral — vincular um patronal existente ou cadastrar um novo ali mesmo, criando o vínculo com a unidade selecionada.
- Sem unidade selecionada: mensagem curta orientando escolher a unidade.

### 3. Cadastro completo em um único diálogo

O diálogo de novo sindicato deixa de ser só laboral e passa a cobrir os dois de uma vez, sem precisar completar nada depois:

- Seção **Laboral** (vinculado ao cargo) e seção **Patronal** (vinculada à unidade), cada uma com Nome, CNPJ, WhatsApp, Data-base, Nome do contato e E-mail do contato.
- Cada seção pode ser ligada/desligada, então dá para cadastrar só o que falta. O diálogo abre com as seções faltantes já ativas.
- Ao salvar: cria os sindicatos, cria os vínculos (cargo e/ou unidade) e enquadra o colaborador no laboral. Os registros nascem completos e aparecem imediatamente em `/dp/cadastros/sindicatos` — a tela separada serve só para consulta/edição futura.
- Validações: nome obrigatório em cada seção ativa; CNPJ/WhatsApp com máscara na tela e dígitos no banco; e-mail validado quando informado.

### 4. Ficha do colaborador

A ficha mostra **Sindicato laboral** e **Sindicato patronal**, em vez de uma linha única.

## Detalhes técnicos

- `useSindicatoDoCargo`: também buscar a negociação vigente do patronal (hoje só do laboral) e devolver `negociacaoPatronal`.
- `SindicatoEnquadramentoField`: layout em duas colunas; remover o `Select` no caso laboral vinculado; adicionar select + botão "Novo" para o patronal quando a unidade não tem vínculo; `vincularExistente` ganha o parâmetro de tipo, inserindo em `dp_sindicato_cargos` ou `dp_sindicato_unidades`.
- `SindicatoQuickFormDialog`: props `cargoId`, `unidadeId`, `faltaLaboral`, `faltaPatronal`; dois blocos de formulário; grava via `useUpsertDpSindicato` (incluindo `contato_nome`/`contato_email`) e insere os vínculos; invalida `dp_sindicatos`, `dp_sindicato_vinculos`, `dp_sindicato_do_cargo`, `dp_sindicato_contexto_unidade`, `dp_cargos`, `dp_colaboradores`.
- `ColaboradorFichaDialog`: duas linhas de sindicato, alimentadas pelo mesmo hook.
- Sem migração de banco e sem mudança de RLS.
