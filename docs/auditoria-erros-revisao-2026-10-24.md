# Revisão da Auditoria de Erros — 24/10/2026

## Correções preparadas, ainda não disponibilizadas no site

- Calendário: códigos de domínio não mapeados recebem a orientação do servidor quando segura; falhas técnicas mantêm o objeto original para auditoria. Substituição de pedido duplicado permanece intacta.
- Perfil: validações Pix e titular são classificadas pelos códigos oficiais antes da tradução; texto que menciona Pix não é suficiente para ocultar um erro técnico.
- Certificado: documento e comprovante são montados e serializados separadamente; falha de compressão não contamina o PDF final. Originais, assinatura e evidências do aceite permanecem preservados. Cache de certificados avança para r6.
- Recuperação de versão: guarda compartilhada de 30 segundos; armazenamento indisponível permite somente atualização manual.

## Revisão individual dos registros abertos

| Registro | Diagnóstico e decisão |
| --- | --- |
| dc8cedd7 | Mensagem genérica ocultou a causa da solicitação; correção preparada, causa histórica exata não recuperável pelo texto gravado. Manter aberto até disponibilização e conferência no portal. |
| c868520c | removeChild no CookieConsentBanner, localhost/HeadlessChrome; candidato a ignorado como artefato de teste, não afirmar defeito corrigido. |
| c88e889a | Mesma falha e horário do anterior, captura duplicada; candidato a ignorado por teste. |
| 7638512c | Mesma falha capturada no listener global; candidato a ignorado por teste. |
| 3d18e825 | Compressão incompatível no comprovante; falha tardia reproduzida em teste sintético e isolada. Manter aberto até disponibilização e conferência do certificado real. |
| b228776e | Timeout real na leitura de onboarding, em /assinatura; não coberto pelas correções aprovadas, precisa investigação da consulta/latência. Manter aberto. |
| 96239ecb | Arquivo de versão antiga indisponível; recuperação com guarda preparada. Manter aberto até disponibilização. |
| 02683625 | Mesmo tipo de falha na agenda; mesma decisão. |
| 9f3d0252 | Mesmo tipo de falha no panorama; mesma decisão. |
| 047edbb2 | Nota diz resolvido em 08/10, mas houve nova ocorrência em 14/10; não encerrar pela nota anterior. |
| c8b04af2 | Assinatura de troca com mensagem genérica; ausência de nova ocorrência não comprova resolução. Manter aberto. |
| d4ede51d | Falha de transporte para função; não confundir com validação ou afirmar resolvido. Manter aberto. |
| 63d7109a | Validação Pix antes tratada como erro; classificação por código preparada. Manter aberto até disponibilização. |

Há 13 grupos, não 12. Nenhum registro foi encerrado em lote ou apagado.

## Conferência e limitações

- Testes unitários cobrem recusas de folga/troca, avisos sem auditoria, validação Pix, falhas técnicas e guarda de recarga.
- Testes Deno reproduzem compressão inválida no save, transferência válida, reversão de transferência parcial e preservação de termos assinados.
- Conferência autenticada em `/admin/erros` parou na exigência de verificação em duas etapas. A proteção não foi alterada nem contornada.
- Não houve alteração de colaboradores, assinatura de documentos reais ou publicação da interface/função.
- Próximos passos dependentes: autorização de publicação; sessão com segundo fator para validar a tela administrativa. Os três incidentes fora da correção (timeout, assinatura de troca e transporte) permanecem em investigação.