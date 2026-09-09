# Pessoas 360°: correções de documentos, acesso, cadastro e condições de trabalho

Retomada do plano anterior (7 frentes), com uma frente nova sobre a alteração de condições de trabalho do Herick.

## Frente 1 — Acesso ao portal

- Senha gerada passa a ser provisória: no primeiro acesso o colaborador é obrigado a definir uma nova senha antes de usar o portal.
- Depois de gerar o acesso, aparece "Enviar pelo WhatsApp" com o texto do modelo de mensagem cadastrado + link do portal + usuário e senha provisória.
- Botão de reenvio ("Resetar senha") gera nova senha provisória e repete o mesmo fluxo.

## Frente 2 — Nome social

- Campo opcional "Nome social / como prefere ser chamado" no cadastro (ex.: Nordman e Erildson → "Júnior").
- Usado em rotina do dia, escalas, listas, avisos e portal. Documentos oficiais, ficha de registro e rescisão continuam com o nome completo.

## Frente 3 — Falsa falta de documentos

- A conferência passa a somar os documentos já salvos (unidade + competência + tipo), não só o lote em processamento — corrige os casos de Karine, Cristiane e da folha de ponto 07/2026 da Garavelo.
- "Lote completo" só existe para documentos coletivos mensais (contracheque, adiantamento, folha de ponto) e só quando faltar de todos os elegíveis. Caso contrário, mostra a quantidade; com um único pendente, mostra o nome.
- Rescisão e documentos pontuais (por pessoa, sem competência coletiva) nunca são tratados como lote nem agrupados por unidade: a pendência é sempre nominal, do colaborador.
- Documento que não é de tipo coletivo nunca gera falta para os demais colaboradores.


## Frente 4 — Adiantamento salarial

- Só é cobrado de quem tem adiantamento marcado no cadastro; sócio, intermitente e PJ ficam fora.
- Histórico da opção com período (início quando liga, fim quando desliga): competências em que a opção estava desativada não geram pendência (caso Rosângela), e os documentos já enviados continuam visíveis no portal.
- Admissão depois da data de pagamento do adiantamento não gera pendência naquela competência (caso Karen, 29/07).
- Desligamento antes da data de pagamento também não gera (caso Karine, 02/07).

## Frente 5 — Folha de ponto, rescisão e importação

- Detecção de tipo reforçada para folha de ponto (palavras-chave do próprio documento), evitando cair em "outros documentos".
- Validação digital ligada por padrão em todo documento enviado ao colaborador.
- Intermitente sem nenhum dia trabalhado na competência não gera pendência de folha de ponto (caso Wanderson, 01/08).
- Importação aceita vários arquivos de uma vez.
- Agrupamento "Documentos de rescisão": TRCT e os demais documentos da rescisão ficam juntos no mesmo grupo.
- Pendências de férias não agendadas saem da tela de importar documentos (permanecem na tela de Férias).

## Frente 6 — Cadastro por ficha e readmissão

- A importação de ficha pede, antes de concluir, os dados que geram inconsistência depois: ponto ativo, adiantamento salarial, vínculo e forma de pagamento.
- Unidade com relógio de ponto já sugere ponto ativo marcado (caso Thais).
- Mudança de vínculo/readmissão (caso Cristiane): tudo amarrado ao CPF — registra a saída como CLT em 27/09 e o novo vínculo freelancer com data de início. Portal e documentos anteriores continuam acessíveis e as pendências passam a seguir o vínculo vigente em cada competência.

## Frente 7 — Rotina do dia no celular

- No celular aparecem apenas os cartões com valor diferente de zero; os zerados ficam recolhidos em um bloco "Sem ocorrências (N)" com o ícone de olho para exibir. No computador nada muda.

## Frente 8 — Condições de trabalho: horário e jornada parcial (caso Herick)

Hoje a janela "Alterar Condições de Trabalho" só permite mudar vínculo, cargo, unidade, setor, forma de pagamento e valor — não há nenhum campo de horário, turno ou carga horária, por isso não foi possível mudar o horário do Herick.

- A janela passa a incluir, com a mesma data de vigência: turno padrão, dias trabalhados e carga horária semanal — abrindo o mesmo painel de turno e jornada já usado no cadastro, mas gravando como mudança com data e histórico.
- Novo campo de jornada contratada (ex.: 30h semanais, jornada parcial). A base de horas do mês deixa de ser fixa em 220h e passa a ser calculada pela jornada contratada (30h/sem → 150h/mês), que é o que define o valor da hora.
- Remuneração proporcional: com salário base de R$ 1.750,00 em 30h semanais, o sistema mostra o salário contratado, a jornada e o valor da hora resultante, e usa essa base na folha, nas horas extras, no DSR, em férias e no 13º.
- Alerta quando a jornada parcial cadastrada não corresponde à soma dos turnos dos dias trabalhados, para não ficar diferença entre o contrato e a escala.
- O histórico da janela passa a mostrar também a jornada e o horário que valiam em cada período.

## Detalhes técnicos

- Cobertura de documentos: `src/lib/dp/bulk-coverage.ts`, `src/lib/dp/pendencias-documentos.ts`, `useDpPendencias.tsx`, `DocConsistenciaPanel.tsx`, `DpCadastroPendenciasLista.tsx` — cruzar `dp_documentos` por unidade/competência/tipo e derivar rótulo de lote a partir de `faltantes === elegiveis`.
- Adiantamento: nova tabela de histórico da opção (`colaborador_id`, `ativo`, `vigencia_inicio`, `vigencia_fim`) + trigger de encerramento; elegibilidade por competência consulta esse histórico junto de admissão/desligamento e do dia de pagamento em `dp_config_dp`.
- Acesso ao portal: flag de senha provisória no estado de segurança do usuário + guard no portal; envio via modelo em `dp_modelos_mensagem`.
- Nome social: coluna `nome_social` em `dp_colaboradores` (normalizada em caixa alta como os demais cadastros) e uso apenas nas telas operacionais.
- Condições de trabalho: `ColaboradorCondicoesDialog.tsx` recebe o `ColaboradorJornadaPanel` e novos campos de jornada; a RPC `dp_colaborador_aplicar_condicao` já aceita `p_base_horas_mes`/`p_base_dias_mes` (hoje enviados como `null`) — passar os valores calculados; `valorHoraDe`/`valorHoraPorBase` deixam de assumir 220h e usam a jornada contratada; `dp_colaborador_historico_condicoes` ganha o turno/jornada aplicados.
- Multiarquivo e grupo de rescisão: lote de importação aceita N arquivos por execução, com agrupamento por `grupo` no lote.
