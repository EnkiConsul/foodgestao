# Relatório das melhorias de telas de hoje (para auditoria externa)

## Objetivo
Gerar um relatório completo, em PT-BR, das melhorias de telas feitas hoje (sem os Planos 01 a 04 do GPT), pronto para colar no ChatGPT conectado ao GitHub, que vai auditar o código.

## Entrega
- Arquivo `relatorio-melhorias-telas-2026-10-15.md` em Arquivos (Markdown, fácil de colar no chat).
- Sem credenciais, tokens, IDs ou URLs internos.

## Conteúdo do relatório
1. **Resumo executivo**: telas alteradas e o objetivo de cada mudança.
2. **Por tela**, com: problema relatado, solução, regras preservadas, arquivos alterados e o que auditar:
   - Documentos / Atestados da Rosângela: linha duplicada e aceite desnecessário (`exige_aceite: false` para atestado, dedupe no acervo, fora do aviso de assinatura).
   - Menu do DP no computador: lista de 1 por linha, descrições de Calendário/Calculadora/Folgas, ícone de Folgas, Calendário em primeiro.
   - Atas (`/dp/documentos/atas`): indicadores, filtros, uma ata por linha, pendências de assinatura, material de apoio (PowerPoint etc.), aviso de PDF.
   - Rotina do Dia: cards sem encavalar, legenda de atestado na lotação de folga, padrão por turno nos Dias com Alerta.
   - Histórico de Atestados: lista sem rolagem lateral, indicadores clicáveis, detalhes, filtros retráteis no celular.
   - Férias: centro operacional (Visão geral, Planejar, Agenda, Pendências administrativas, Histórico, Regras), sem perda de alertas.
   - Ocorrências: atestado aprovado não fica a tratar, visões Dia a dia/Por colaborador, "Marcar como lançado", 4 blocos, Copiar resumo do ponto, período Mês civil/Corte da folha, "Mais filtros", texto duplicado removido.
3. **Mudança no banco**: só uma (migration `ocorrencia_lancado_ponto`: 2 colunas + RPC com checagem de permissão e grants), com o que conferir.
4. **Testes feitos**: unitários criados (atestado/tratativa, classificação nos 4 blocos), verificação de tipos, testes no navegador em 1280px e 390px com dados reais.
5. **Limites e pendências conhecidas**: período de corte guardado só no navegador; falhas preexistentes (TypeScript strict, ESLint, migrations check) fora do escopo.
6. **Checklist de auditoria para o GPT**: pontos específicos a revisar no GitHub (regressões, permissões da RPC, regras de atestado, overflow no celular, preservação de alertas de férias).

## Detalhes técnicos
- Lista de arquivos tirada do histórico da conversa e conferida com o código atual antes de escrever.
- Nenhuma alteração no app ou no banco; só a criação do arquivo do relatório.
