# Pessoas 360 — Fase 5: Usabilidade e Mobile

## Onde estamos

Do Plano Mestre de revisão do Pessoas 360, já foram entregues:

- **Fase 1** — correções críticas da Rotina do Dia e da Jornada.
- **Fase 2** — visão unificada de pessoas e busca amigável no menu.
- **Fase 3** — freelancer/CLT coerentes, condições de trabalho com vigência, folha fora da navegação.
- **Fase 4** — Férias sem passivos históricos artificiais (corte de controle, selo "Controle externo", saldo trazido).

## Objetivo desta fase

Deixar o Pessoas 360 confortável de usar **no celular** e mais rápido de ler **no computador**, sem mudar nenhuma regra de negócio.

### 1. Tabelas virando cards no celular

Telas com listas largas hoje exigem rolagem lateral no celular. Criar um padrão único de "lista responsiva":

- No celular, cada linha vira um **card** com as informações principais (nome, status, ação principal) e um toque para abrir detalhes.
- No computador, a tabela continua igual.

Telas priorizadas nesta ordem:

1. **Colaboradores** (`DpColaboradores`) — a mais usada.
2. **Férias** (`DpFerias`) — lista de períodos e gozos.
3. **Folgas** (`DpFolgas`) e **Convocações** (`DpConvocacoes`) — listas diárias.
4. **Ocorrências** (`DpOcorrencias`) e **Atestados** (`DpAtestados`).
5. **Solicitações** (`DpSolicitacoes`) e **Trocas** do portal.

### 2. Portais do gestor e do colaborador

- **Colaborador** (`/dp/meu/*`): revisar as telas no celular — escala, ponto, férias, documentos, trocas — garantindo botões grandes, textos legíveis e ações principais sempre visíveis sem rolar.
- **Gestor**: ações rápidas mais usadas (aprovar/recusar, cobrir ocorrência, adicionar pessoa ao dia) acessíveis em um toque a partir da Rotina do Dia.

### 3. Padronizações de leitura

- Cabeçalhos de tela com título + ação principal alinhados (hoje variam).
- Estados vazios com frase orientando o próximo passo ("Nenhuma convocação neste dia — crie a primeira").
- Confirmações destrutivas sempre com o mesmo diálogo padrão.

### 4. Testes e evidências

- Typecheck e testes do Pessoas 360.
- Validação visual no preview em **largura de celular** (não apenas desktop): Colaboradores, Férias, Folgas, Convocações, Rotina do Dia e portal do colaborador.

## Depois desta etapa

Fechada a Fase 5, o Plano Mestre fica concluído. Novos temas (ex.: relatórios gerenciais, notificações push) entram como planos próprios, um por vez, após sua aprovação.

## Detalhes técnicos

- Componente compartilhado `ResponsiveList` (ou similar): recebe colunas da tabela e um renderizador de card; decide pela largura da tela (`useIsMobile` já existe no projeto).
- Nenhuma mudança de banco de dados nesta fase — apenas apresentação.
- Títulos em Iniciais Maiúsculas; mensagens em português; erros de banco sempre traduzidos.
- Não rodar o servidor de desenvolvimento; validar com Playwright em viewport mobile (ex.: 390×844) e desktop (1280×1800).
