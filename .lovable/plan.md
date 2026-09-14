# Ajustes do Portal do Colaborador

Lista completa dos pontos relatados, entregue de uma vez. Organizada por tela.

## Acesso e primeiro uso

- Na mensagem de acesso ao portal, um botão "Copiar senha" que copia só a senha temporária, separado do texto completo.
- Ao entrar no portal pela primeira vez, destaque para instalar o atalho como app no celular (com o passo a passo do iPhone e do Android).

## Documentos

- Exigir do colaborador apenas os documentos que são dele. Contrato de trabalho, ASO e demais documentos emitidos pela empresa ficam ocultos enquanto a empresa não anexar o arquivo, e nunca contam como pendência dele.
- A pendência de assinatura passa a abrir o documento em questão, não a página de documentos nem a área de importação.
- O certificado de aprovação abre como PDF, sem chamar a impressora do celular.
- Mostrar todos os documentos do colaborador, incluindo os enviados antes da mudança de processo (casos como o atestado do mês 06 e os adiantamentos dos meses 05 e 06 que não abrem).
- Os documentos avisados na tela inicial passam a abrir ali mesmo.
- Documento cujo prazo ainda não chegou (ex.: adiantamento de salário de setembro) deixa de exigir assinatura obrigatória; fica como "disponível", e só cobra depois da data.
- Corrigir a notificação de assinatura que aparece mesmo com tudo já assinado.
- No menu, "Sindicato" abre a tela de sindicato, e não a de documentos.
- "Histórico" sai de Minha Escala e passa para o menu de Documentos.

## Meu Calendário

- Mostrar a folga de domingo junto com a folga semanal.
- No dia, listar os colegas da mesma unidade que já estão de folga, para não escolher um dia lotado.
- Nos dias de meio de semana, liberar as ações de trocar folga e pedir exceção.
- Corrigir o erro ao marcar folga (caso do dia 20/09), com mensagem clara quando a data estiver bloqueada.

## Rotina da Loja

- Respeitar a visão por setor definida como padrão da empresa.
- Mostrar o dia que está sendo navegado (aparecia 14 estando no dia 13).
- Não listar quem está de folga no dia (casos Sara e Thais).
- Mostrar somente o turno do próprio colaborador, não os colegas de outros turnos.

## Minhas Trocas

- Botão para criar uma nova troca.
- Em "minha data", listar apenas as datas em que ela já está de folga, em vez do calendário inteiro.
- Só depois de escolher a data desejada, listar os colegas com quem a troca é possível naquela data.

## Minhas Férias

- Data de início não pode ser anterior à data permitida para começar o gozo.
- Campo de venda de dias permite apagar o zero e digitar a quantidade, e informa o máximo permitido por lei.
- Quem já adiantou a primeira parcela do 13º não vê a opção de adiantamento nas férias.
- A data fim passa a ser calculada: o colaborador escolhe abono, divisão dos períodos e adiantamento; os dias vendidos reduzem a data fim automaticamente.

## Ocorrências e ponto

- Corrigir o corte da tela de ocorrências no celular.
- Nas ocorrências de ponto, incluir "relógio de ponto com defeito" e "ponto não registrando".

## Menu e desempenho

- O menu inferior volta a ficar fixo ao rolar de baixo para cima.
- Esconder "Minha Escala" para colaborador fixo; segue apenas para freelancer e intermitente.
- As pendências do portal passam a atualizar na mesma regra do portal do gestor, em vez de recarregar a cada entrada na tela.
- "Relatar problema" abre no primeiro clique, e corrigir a falha ao enviar o chamado.

## Detalhes técnicos

- Requisitos de documento: filtrar por responsável (colaborador x empresa) em `documentos-requisitos.ts` e no checklist do portal; itens da empresa só entram na lista quando existe anexo, e ficam fora de `pendentesObrigatorios`.
- Pendência de assinatura: link direto para o documento (`/dp/meu/documentos?doc=<id>`) abrindo o gate de assinatura.
- Abertura de arquivos: usar URL assinado com `Content-Disposition: inline` e tipo `application/pdf` no certificado e nos anexos legados, cobrindo registros antigos com bucket/caminho diferentes.
- Prazo do documento: comparar `referencia_data`/vencimento antes de marcar exigência de aceite.
- Calendário/rotina: incluir folga dominical na consulta do portal, filtrar quem está de folga, usar a data navegada e o turno do próprio colaborador, e ler o padrão de agrupamento da empresa.
- Férias: mover o cálculo de data fim para o resolvedor de direito de férias (`ferias-direito.ts`), com abono limitado a 1/3 e bloqueio do adiantamento quando o 13º já foi antecipado.
- Pendências do portal: mesma estratégia de cache/materialização já usada no gestor (sem refetch por foco de tela).
- Relato de erro: garantir montagem única do diálogo e corrigir o envio do chamado.
