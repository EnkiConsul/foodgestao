# Acertar o que ficou pendente em Pessoas 360°

Levantei cada ponto que você citou. Vários pedidos antigos realmente nunca foram concluídos (nome social, menu Geral, importar vários arquivos, sincronizar pendências). Abaixo está o plano único para fechar tudo.

## 1. Ausência sem motivo virando "folga padrão"
Hoje o painel do dia só troca a situação da pessoa quando ela estava marcada para trabalhar. Se o dia dela não tem jornada, ela entra como "Folga padrão" e a ausência registrada é ignorada. Além disso, "Outra divergência de jornada" (o "outros") não é tratado como ausência.

- Criar motivos claros de ausência: "Falta avisada", "Falta não avisada", "Falta justificada" e manter "Outro" — sempre com campo de motivo.
- Qualquer ausência registrada passa a prevalecer sobre "Folga padrão": a pessoa aparece como ausente/avisou, e sai da contagem de folga.

## 2. Convocação fora do prazo com erro
A justificativa hoje é um único texto para todos os dias, e o servidor cancela a publicação inteira quando um dia falha — sem dizer qual dia.

- Publicar dia por dia: os dias que passam ficam publicados e recolhidos ("Publicado"); só o dia com problema fica aberto, destacado, com o motivo em português.
- Mover o bloco de ciência/justificativa para o fim, junto de "Revisar e publicar", e rolar automaticamente até ele quando for exigido.
- Justificativa por dia (o campo já é aceito por dia no servidor), com opção de repetir para todos.

## 3. Horário do Herick diferente na rotina do dia
Existem duas contas de horário no sistema: uma no portal/ponto e outra no painel do dia. Vou unificar tudo na regra oficial (convocação aceita > escala publicada > rascunho > jornada do cadastro), mantendo no painel as exceções próprias dele (cobertura, mão de obra extra, férias, atestado). Assim o horário exibido passa a ser o mesmo em todas as telas.

## 4. Menu "Geral"
Criar o grupo "Geral" na barra do módulo com: Analytics, Configurações (sem "de Pessoas") e Auditoria de Pessoas (histórico de alterações) — era a tela que faltava. SESMT continua como está.

## 5. Pendências sincronizadas e mais rápidas
Hoje a tela de Início e a de Importar calculam pendências separadamente, com janelas diferentes (Início inclui o mês atual; Importar só os 6 meses fechados) — daí a folha de ponto 06/26 aparecer numa e não na outra, e o caso da Kassiane não aparecer.

- Uma única fonte de pendências de documentos, usada por Início, Importar e pendências do colaborador.
- Guardar o resultado calculado no banco, atualizado automaticamente às 6h e a cada 8h, e sempre que o gestor resolver/ignorar/adiar uma pendência ou concluir uma importação.
- Botão "Atualizar" com a data e hora da última atualização abaixo.
- Ignorar/adiar refletem nas três telas.

Resposta direta: não, não está certo — a pendência da folha de ponto da Kassiane em 06/26 deve aparecer, e passa a aparecer.

## 6. Importação de documentos
- Permitir selecionar e enviar vários arquivos de uma vez (e arrastar vários), processando em fila com um resumo único ao final.
- Criar o agrupamento "Documentos da rescisão": TRCT, demonstrativo, aviso, guias, exames e outros anexos entram sob a mesma rescisão e aparecem agrupados no histórico do colaborador.

## 7. Erro ao confirmar se o Erildson trabalhou em 05/2026
Vou confirmar a causa exata (permissão ou chave de gravação da confirmação) e corrigir, mostrando mensagem clara em caso de falha.

## 8. Nome social
Adicionar "Nome social / Como prefere ser chamado" no cadastro. Usado nas telas do dia a dia, escalas, portal e mensagens; o nome completo continua nos documentos oficiais.

## 9. Link do portal na mensagem
Vou fazer o link ser reconhecido em qualquer forma que você escreveu no modelo e validar o envio para a Karen, mostrando prévia antes de enviar.

## 10. Portal da Karen
- Não oferecer "Escolher folga do mês" a quem tem folga fixa/automática.
- Rotina da loja: mostrar a equipe do dia mesmo sem escala publicada (usar a rotina prevista) e avisar quando não houver unidade vinculada.
- Calendário: marcar sábado e domingo como folga semanal para quem tem folga fixa.
- Pendências de documentos pessoais: abrir a lista do que falta dela enviar, não a lista de documentos da empresa.

## Detalhes técnicos
- Ausência: incluir `divergencia_jornada` e novos motivos em `OCORRENICA_CATEGORIA` e permitir sobrepor `folga_padrao` em `src/lib/dp/operacao-panorama.ts`.
- Horário: `operacao-panorama.ts` passa a consumir `src/lib/dp/horario-previsto.ts`.
- Convocação: publicação por ocorrência (nova RPC ou laço com `SAVEPOINT`), retorno com resultado por dia; `RevisaoConvocacao.tsx`/`NovaConvocacaoPlanner.tsx` ajustados.
- Pendências: tabela materializada + função agendada (cron 6h e a cada 8h) alimentada por uma única regra derivada de `pendencias-documentos.ts`; `useDpPendencias` e `DocConsistenciaPanel` passam a ler dela.
- Importação: `input multiple` em `BulkImportPanel` e novo agrupador `rescisao` em `documentoTipos.ts`.
- Nome social: coluna `nome_social` em `dp_colaboradores` + exibição.
