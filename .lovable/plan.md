# Ajustes da Ficha de Admissão, Endereço e Regras de Obrigatoriedade

São 15 pontos. Proponho entregar em 4 fases, na ordem abaixo, para você conferir cada bloco antes de seguir.

## Fase 1 — Correções rápidas da ficha do candidato

1. **Colaboradores abre em "Colaboradores"**: hoje a tela lembra a última aba usada e reabre nela (inclusive em "Pré-Admissão"). Passa a abrir sempre em Colaboradores.
2. **Nome e telefone do gestor aparecem preenchidos**: o convite guarda nome e WhatsApp, mas o formulário do candidato não os usa. Passam a vir preenchidos.
3. **Nome e CPF sem alteração livre**: ficam somente leitura, com o botão "Solicitar correção destes dados", que registra o pedido e avisa o gestor (aparece na revisão do gestor). Nada é alterado sem o gestor decidir.
4. **CPF formatado** (000.000.000-00) na ficha do candidato e nas telas onde ainda aparece cru.
5. **Data de nascimento digitada** com máscara dd/mm/aaaa em vez de calendário, com validação de data real e idade plausível.
6. **Nome social** ("como prefere ser chamado") e **naturalidade, UF de nascimento, nacionalidade e raça/cor** passam a existir na ficha do candidato, com as mesmas opções já usadas no cadastro do colaborador.
7. **Tela do Lovable antes do formulário**: o link do candidato deve apontar para o domínio publicado (aveto360.com), não para o endereço de pré-visualização, que exige a tela de acesso. Vou conferir qual endereço o convite está montando e corrigir a origem do link. Se o que você viu foi outra tela, me mande a foto.

## Fase 2 — Endereço padronizado em todo o sistema

- Um único componente de endereço, reaproveitado no candidato, no cadastro do colaborador, no portal, em empresas/unidades e nos contatos.
- **CEP é o primeiro campo**; ao completar, busca automática (ViaCEP) preenchendo rua, bairro, cidade e UF; falha na consulta não travá o preenchimento manual.
- **UF sempre em lista** com as 27 siglas.
- Caixa **"Sem número"**, que grava "S/N" e dispensa o campo número.
- Erros e obrigatoriedade do endereço vindos das regras da Fase 3.

## Fase 3 — Aba "Regras" da Admissão

Nova aba dentro de Pré-Admissão, com um formulário único onde a empresa define **o que é obrigatório**:

- Lista de todos os campos da ficha e de todos os documentos, cada um com: obrigatório / opcional / não pedir.
- Escopo combinável: **empresa**, **unidade**, **tipo de vínculo** (fixo, intermitente, estágio, jovem aprendiz, sócio…) e **cargo** — podendo marcar mais de um em cada escopo.
- Regra mais específica vence a mais geral (cargo > vínculo > unidade > empresa).
- **Familiares**: a empresa escolhe quais graus de parentesco podem ser incluídos (e para quais finalidades: dependente de imposto, Sesc).
- O formulário do candidato passa a exigir de verdade o que estiver marcado como obrigatório: hoje vários campos obrigatórios podem ficar em branco. A validação é feita no servidor, campo a campo, e o candidato não consegue enviar sem preencher.

## Fase 4 — Documentos com frente e verso, e revisão bloqueada

- **Vários arquivos por documento** (frente, verso, páginas extras), na ficha de admissão e nos documentos pendentes do colaborador: cada documento passa a listar seus arquivos, com adicionar, ver e remover antes do envio.
- **Não é possível pedir revisão sem documento**: o envio da ficha e a revisão do gestor exigem que os documentos obrigatórios (conforme as regras da Fase 3) estejam anexados; a checagem também é feita no servidor.

## Detalhes técnicos

- Novas tabelas: `dp_admissao_regras` (campo/documento, exigência, escopo empresa/unidade/vínculo/cargo) e `dp_admissao_regra_parentescos`; resolução por função `SECURITY DEFINER` usada tanto pela tela quanto pelas funções de servidor, com RLS por empresa e GRANTs explícitos. Reaproveita `dp_documento_requisitos`/`dp_requisito_cargos`/`dp_requisito_unidades` onde já existe equivalência, em vez de duplicar catálogo.
- Documentos: `dp_preadmissao_documentos` e `dp_colaborador_documentos` ganham agrupamento por documento (ordem/rótulo frente-verso) preservando os registros atuais; nenhum arquivo existente é apagado.
- Campos novos da ficha (`nome_social`, `naturalidade`, `naturalidade_uf`, `nacionalidade`, `raca_cor`) usam os mesmos nomes canônicos do cadastro do colaborador, entram na allowlist do servidor e na comparação com a ficha oficial.
- Pedido de correção de nome/CPF: novo evento em `dp_preadmissao_eventos` + aviso na revisão do gestor; o candidato nunca grava esses campos.
- Endereço: `src/components/shared/EnderecoFields.tsx` + hook de CEP com cache, substituindo os blocos duplicados; nenhuma migration de dados.
- Migrations com rollback documentado e não destrutivo; validação em servidor sempre fail closed.

## Sobre testes

Vou rodar apenas typecheck, lint dos arquivos alterados e os testes já existentes da fase, mais uma verificação pontual no navegador de cada bloco — sem baterias completas de QA.
