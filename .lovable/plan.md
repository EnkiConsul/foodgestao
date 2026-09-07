# Importação de ficha: WhatsApp, completar o cadastro na hora e aviso do que falta

Três correções, a partir do que aconteceu com a Thais.

## 1. WhatsApp

O cadastro do colaborador tem campo de WhatsApp, mas a tela de conferência da ficha só tem Telefone — o que você digitou lá foi gravado apenas como telefone, então o WhatsApp ficou vazio.

- Campo **WhatsApp** na tela de conferência, ao lado do Telefone.
- Ao digitar o telefone, o WhatsApp é preenchido igual automaticamente (dá para apagar ou trocar).
- O WhatsApp passa a entrar também na comparação lado a lado de quem já tem cadastro.

## 2. Completar o restante do cadastro já na tela da ficha

Hoje a conferência só mostra o que veio na ficha (nome, CPF, datas, salário, cargo, unidade, horário). O resto só dá para preencher depois, abrindo o colaborador.

- Novo bloco **"Completar cadastro"** em cada ficha, recolhido por padrão e com aviso de quantos campos ainda faltam: setor, tipo de vínculo (CLT, sócio, freelancer…), e-mail, WhatsApp, estado civil e endereço (rua, número, bairro, cidade, UF, CEP), já com o que a ficha trouxe.
- O que a ficha leu continua marcado como lido; o que você digitar fica marcado como preenchido por você.
- Ação em lote para aplicar o mesmo setor e o mesmo vínculo às fichas selecionadas (cargo, unidade e horário seguem ficha por ficha, como hoje).
- Depois de criar o cadastro, botão **"Abrir cadastro completo"** direto no card, para os campos que não cabem aqui (benefícios, dados bancários, jornada detalhada).

## 3. Sinalizar o que ficou faltando

A Thais entrou na lista sem nenhum aviso do que estava incompleto.

- Antes de confirmar, o card mostra a lista do que vai ficar em falta ("Falta: setor, endereço, e-mail"). Nada bloqueia — a criação continua possível.
- Na lista de Colaboradores, quem está incompleto ganha o selo **"Cadastro incompleto"** com a contagem, e existe um filtro "Só cadastros incompletos".
- Na ficha de consulta do colaborador, um aviso no topo listando os campos em falta, com atalho para a aba onde se preenche.
- O painel de pendências do DP passa a ter o item **"Completar cadastro de colaborador"**, uma linha por pessoa incompleta, levando direto ao cadastro.
- Considerados em falta: setor, telefone/WhatsApp, e-mail, endereço, data de nascimento, estado civil, vínculo, PIS e salário. (Se preferir outra lista, ajusto.)

## Detalhes técnicos

- `src/lib/dp/ficha-registro/payload.ts`: coluna `whatsapp` em `CAMPOS_FICHA` e em `montarPayloadFicha`; novas colunas de contato/endereço/setor/regime já suportadas pelo mesmo mapeamento.
- Novo módulo puro `src/lib/dp/cadastro-completude.ts`: `CAMPOS_ESSENCIAIS` + `camposFaltando(colaborador)` → rótulos e aba de destino; usado pelo card da ficha, pela lista, pela ficha de consulta e pelas pendências. Testes em `src/test/unit/`.
- `FichaRevisaoCard.tsx`: campos WhatsApp (espelhando telefone enquanto não editado), bloco recolhível "Completar cadastro" (setor via `useDpSetores`, regime pelo enum `dp_regime_trabalho`, endereço em partes usando `endereco-parse`), resumo de faltantes por `camposFaltando`, botão "Abrir cadastro completo" reaproveitando `ColaboradorFormDialog`.
- `DpFichaRegistroImportar.tsx`: barra de ação em lote para setor/vínculo das fichas selecionadas.
- `useDpFichaImportacao.tsx`: `AplicarFichaInput` recebe `setorId`/`regime` e grava `whatsapp`, `email_contato`, `estado_civil`, `endereco`.
- `DpColaboradores.tsx`: selo + filtro de incompletos; `ColaboradorFichaDialog.tsx`: aviso no topo; `useDpPendencias.tsx`: novo bloco de cadastro incompleto (consulta as colunas essenciais dos colaboradores ativos da empresa).
- Sem mudanças de banco, RLS ou edge function.
