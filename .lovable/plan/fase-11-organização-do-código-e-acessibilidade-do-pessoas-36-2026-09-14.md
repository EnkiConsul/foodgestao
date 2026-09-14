# Fase 11 — Organização do código e acessibilidade do Pessoas 360°

Diagnóstico feito lendo as telas, hooks, componentes e utilitários do módulo Pessoas e do Portal. Nada foi alterado ainda.

## 1. Diagnóstico

O módulo já tem uma base boa de peças reutilizáveis (páginas, filtros, janelas, listas, estados vazios/erro, confirmação de exclusão) e mensagens de erro centralizadas. Os problemas encontrados são de acabamento e de repetição, não de arquitetura.

## 2. Repetição e complexidade encontradas

- A mesma função de formatar data foi escrita 15 vezes em telas diferentes; a de formatar hora, 7 vezes; a de limpar pontuação de CNPJ, 3 vezes. Isso faz a mesma data aparecer com formatos ligeiramente diferentes entre telas.
- 14 arquivos do módulo não são usados por nenhuma tela (telas antigas de cobertura mínima, cópia de configuração, janela de dia do calendário, histórico disciplinar antigo, editor de horários, replicar/salvar regras, validação de menor, detalhe do dia da convocação, cartão de notificações, dois arquivos de apoio e dois carregadores de dados).
- Arquivos muito grandes: cadastro do colaborador (3.237 linhas), folgas (1.654), panorama (1.625), nova convocação (1.566), lista de colaboradores (1.426), pendências (1.393). Não serão reescritos nesta fase.
- 500+ usos de tipo livre (`any`) concentrados em poucos arquivos; só os de risco real serão tocados.

## 3. Problemas de acessibilidade

- 71 botões que só mostram um ícone não têm nome falado, então quem usa leitor de tela ouve apenas "botão". Aparecem em colaboradores, histórico completo, atestados, avisos, mensagens, modelos de mensagem, advertências, folgas, unidades, cargos, configurações, dependentes, calendário e painéis de cargo.
- Vários campos de formulário têm rótulo apenas visual, sem ligação com o campo: tocar no rótulo não foca o campo e o leitor de tela não anuncia o nome. Maiores focos: remuneração, advertências, atestados, nova convocação, benefícios, cadastro do colaborador, pessoa avulsa e perfil do Portal.
- Mensagens de erro de campo aparecem como texto solto, sem vínculo com o campo que falhou.
- Hierarquia de títulos: o cabeçalho das telas usa dois níveis diferentes conforme o modo, o que confunde a navegação por títulos.
- As janelas (modais) já usam a base acessível, com foco preso e devolvido ao fechar — sem problema aqui.
- Não há elementos clicáveis fora de botão: os 8 casos encontrados só impedem a propagação do clique.

## 4. Prioridades

- P1: nome falado nos botões só com ícone; ligação rótulo/campo e erro/campo nos formulários mais usados; um único nível de título por tela.
- P2: uma única função de data, hora e limpeza de pontuação usada por todas as telas; remoção dos 14 arquivos sem uso.
- P3: tipos livres óbvios nos arquivos já tocados e limpeza de imports que sobrarem.

## 5. O que será feito

1. Todo botão só com ícone recebe um nome descritivo ("Editar colaborador", "Excluir aviso", "Ver histórico"), sem mudar a aparência.
2. Rótulos passam a ficar ligados ao campo correspondente, e a mensagem de erro do campo passa a ser anunciada junto dele, nas telas de remuneração, advertências, atestados, nova convocação, benefícios, pessoa avulsa e perfil do Portal.
3. As formatações repetidas de data, hora e pontuação passam a vir de um único lugar já existente de utilitários do módulo, mantendo exatamente o mesmo texto exibido hoje.
4. Os 14 arquivos sem uso são removidos, após conferir um por um que nenhuma tela ou rota os abre.
5. O cabeçalho das telas passa a usar um único nível de título.

Fora de escopo: reescrever as telas grandes, mudar identidade visual, rotas, regras de negócio, banco, permissões, documentos, filas ou a regra dos 30 dias após o desligamento.

## 6. Testes

- Formatação de data/hora/pontuação mantém o mesmo resultado de antes (comparando com os formatos atuais de cada tela).
- Botões só com ícone podem ser encontrados pelo nome falado nas telas mais usadas.
- Rótulo clicado foca o campo certo e o erro é anunciado junto do campo.
- Regressão: formulários salvam, janelas abrem e fecham, ações críticas e Portal seguem iguais, estados de erro continuam aparecendo.

## 7. Validações

Tipos, lint, suíte completa, build e verificação de segurança mantendo a linha de base de 63. Nenhuma migração prevista, então a checagem de migrações roda apenas para confirmar que nada mudou.

## 8. Reversão

Desfazer o commit da fase. As mudanças são de organização de código, nomes falados e ligação de rótulos — sem alteração de dados nem de regras.
