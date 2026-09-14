# Ajustes do portal do colaborador, senha e convocação

Onze pontos levantados no uso real (Alessandra / Pakerê). Agrupados por assunto.

## 1. Senha

- Senha provisória: passa a ser curta e fácil de digitar (8 caracteres, só letras e números, sem símbolos e sem letras/números ambíguos).
- Senha escolhida pelo colaborador: mínimo de 8 caracteres com uma letra e um número; sem exigência de símbolo. A regra do servidor de contas será ajustada junto, para não recusar o que a tela aceita.
- Tela de primeiro acesso travada: hoje, quando o servidor recusa a senha, a mensagem vem em inglês e a pessoa fica no mesmo lugar; e quando dá certo em uma tentativa anterior, ela não é levada adiante. Passa a: mensagem em português dizendo exatamente o que falta, e assim que a senha é aceita a pessoa entra direto no aplicativo. Se a senha já tiver sido trocada, a tela não reaparece.

## 2. Portal da Alessandra

- Saudação e demais textos de conversa passam a usar o nome em caixa alta e baixa ("Boa noite, Alessandra"), mesmo com o cadastro gravado em CAIXA ALTA.
- Documentos (contracheque, folha de ponto etc.) passam a ser ordenados por competência, do mais recente para o mais antigo, em vez da ordem de envio.
- Minha Escala: passa a mostrar também os dias de convocação aceita, somados aos dias da escala publicada. A frase "a escala deste mês ainda não foi publicada" só aparece quando não há nem escala nem convocação aceita no mês; havendo convocação, o aviso vira uma observação discreta.
- Indisponibilidade futura: a tela de disponibilidade do mês ganha atalho fixo no menu do portal ("Minha disponibilidade"), e o registro de ausência aceita datas futuras com o aviso de que o gestor analisa depois.
- Rodapé do menu: fica fixo, com respiro para a barra do sistema Android, sem rolar nem cortar conteúdo.
- Revisão das telas do portal em tela de celular pequena (407 px), corrigindo textos encavalados e colunas apertadas nas telas de convocação, documentos, disponibilidade e rotina.

## 3. Convocação: o que a pessoa vai receber

- Intermitente: o valor mostrado passa a ser um resumo com as parcelas — horas × valor-hora, adicional noturno das horas em faixa noturna, 1/12 de 13º proporcional, 1/12 de férias proporcional com o terço, prêmio de assiduidade quando cadastrado e o vale-alimentação do dia. Cada linha aparece nomeada, com o total ao final e a marca de que é estimativa.
- Freelancer: ao montar a convocação o gestor informa valor da diária, refeição (na loja ou vale, com valor), ajuda de transporte (com valor) e se há gorjeta. Esses campos só aparecem para freelancer, nunca para intermitente.
- Para os dois vínculos: campo livre de observações que a pessoa vê junto do convite.

## 4. Ficha importada

- As fichas de registro importadas passam a ter tela própria em Documentos, listando cada importação (data, arquivo, quantas pessoas) e, dentro dela, cada colaborador com link para abrir o arquivo original.
- Na ficha do colaborador, um link "Ficha importada" leva ao mesmo arquivo.

## Detalhes técnicos

- Senha: `supabase--configure_auth` com `password_requirements` = letras maiúsculas/minúsculas + dígitos e `password_min_length` 8; `src/pages/PrimeiroAcesso.tsx` (zod, tradução dos erros do servidor, `navigate` após sucesso e checagem de `must_change_password` já limpo); `supabase/functions/_shared/provisional-password.ts` (8 caracteres).
- Portal: `DpMeuHome.tsx` com `toProperName` no primeiro nome; `useDpDocumentos.tsx` ordenando por competência/`data_referencia`; `DpMeuEscala.tsx` mesclando `dp_convocacoes` aceitas com `dp_escala_itens`; `mobileNav`/`.dp-shell` com `env(safe-area-inset-bottom)`; atalho de disponibilidade em `dpNavigation.tsx`.
- Convocação: nova função pura `src/lib/dp/convocacao-remuneracao.ts` (parcelas do dia, noturno via faixas do turno, 13º/férias 1/12, VA de `useDpValeCalculadora`), usada no snapshot da convocação e nas telas do gestor e do portal; migração em `dp_convocacoes` com `freela_valor_diaria`, `freela_refeicao_tipo`, `freela_refeicao_valor`, `freela_transporte_valor`, `freela_gorjeta`, `observacoes_convite` e campos exibidos condicionalmente em `NovaConvocacaoPlanner.tsx`/`RevisaoConvocacao.tsx`/`DpMinhasConvocacoes.tsx`.
- Ficha importada: nova tela lendo `dp_ficha_importacoes`/`dp_ficha_importacao_itens` com link assinado do arquivo, mais atalho na ficha do colaborador.
- Validação em navegador simulando celular (390x844) nas telas do portal alteradas.
