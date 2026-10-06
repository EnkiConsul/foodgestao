// Textos oficiais da régua de cobrança e do trial — AVETO 360.
// Tom cordial e objetivo, sem ameaça nem exposição (art. 42 do CDC).

export interface BillingCopyData {
  nome?: string
  empresa?: string
  cnpj?: string
  valor?: string
  data?: string
  dataSuspensao?: string
  dataRescisao?: string
  dataExpiracao?: string
  diasAtraso?: number
  link?: string
  linkExportacao?: string
  linkPlanos?: string
  modulo?: string
}

export interface BillingCopy {
  subject: string
  heading: string
  paragraphs: string[]
  ctaLabel?: string
  ctaKey?: 'link' | 'linkExportacao' | 'linkPlanos'
  destaque?: 'neutro' | 'atencao' | 'urgente'
  formal?: boolean
}

const nome = (d: BillingCopyData) => d.nome || 'tudo bem'
const empresa = (d: BillingCopyData) => d.empresa || 'sua empresa'
const modulo = (d: BillingCopyData) => (d.modulo ? ` do ${d.modulo}` : '')
const valor = (d: BillingCopyData) => d.valor || 'em aberto'

export const BILLING_STAGES = [
  'd_menos_3',
  'd_0',
  'd_mais_1',
  'd_mais_5',
  'd_mais_8',
  'd_mais_10',
  'd_mais_11',
  'd_mais_20',
  'd_mais_28',
  'd_mais_31',
  'd_mais_60',
  'd_mais_80',
  'd_mais_90',
  'reativacao',
] as const

export const TRIAL_STAGES = [
  'trial_d5',
  'trial_d7',
  'trial_pos_3',
  'trial_pos_10',
] as const

export const GRACE_STAGES = [
  'cortesia_encerrada',
  'grace_d_menos_3',
  'grace_d_menos_1',
  'grace_d0',
] as const

export type BillingStage = (typeof BILLING_STAGES)[number] | (typeof TRIAL_STAGES)[number] | (typeof GRACE_STAGES)[number]

export const STAGE_NUMERO: Record<string, number> = {
  d_menos_3: -3,
  d_0: 0,
  d_mais_1: 1,
  d_mais_5: 5,
  d_mais_8: 8,
  d_mais_10: 10,
  d_mais_11: 11,
  d_mais_20: 20,
  d_mais_28: 28,
  d_mais_31: 31,
  d_mais_60: 60,
  d_mais_80: 80,
  d_mais_90: 90,
  reativacao: 0,
}

export function billingCopy(stage: string, d: BillingCopyData): BillingCopy {
  switch (stage) {
    case 'd_menos_3':
      return {
        subject: `Sua fatura Aveto 360 vence em ${d.data ?? 'breve'}`,
        heading: 'Sua mensalidade vence em 3 dias',
        paragraphs: [
          `Olá, ${nome(d)}! A mensalidade do Aveto 360 da ${empresa(d)}, no valor de ${valor(d)}, vence em ${d.data ?? 'breve'}.`,
          'Você pode pagar por Pix, boleto ou cartão. Se já pagou, desconsidere esta mensagem.',
        ],
        ctaLabel: 'Pagar agora',
        ctaKey: 'link',
      }
    case 'd_0':
      return {
        subject: 'Sua fatura Aveto 360 vence hoje',
        heading: 'Sua mensalidade vence hoje',
        paragraphs: [
          `Olá, ${nome(d)}! A mensalidade da ${empresa(d)}, no valor de ${valor(d)}, vence hoje.`,
          'Pague por Pix, boleto ou cartão pelo botão abaixo. Se já pagou, desconsidere.',
        ],
        ctaLabel: 'Pagar agora',
        ctaKey: 'link',
      }
    case 'd_mais_1':
      return {
        subject: 'Não identificamos o pagamento da sua fatura',
        heading: 'Não identificamos o pagamento',
        paragraphs: [
          `Olá, ${nome(d)}. A fatura de ${valor(d)} com vencimento em ${d.data ?? 'ontem'} ainda está em aberto.`,
          'Seu acesso continua normal. Regularize pelo botão abaixo. Precisa de ajuda? Responda esta mensagem.',
        ],
        ctaLabel: 'Regularizar',
        ctaKey: 'link',
        destaque: 'atencao',
      }
    case 'd_mais_5':
      return {
        subject: 'Lembrete: sua fatura Aveto 360 segue em aberto',
        heading: 'Sua fatura segue em aberto',
        paragraphs: [
          `Olá, ${nome(d)}. A fatura de ${valor(d)}, vencida em ${d.data ?? '—'}, continua pendente.`,
          'O acesso da sua equipe segue liberado. Basta quitar pelo botão abaixo para manter tudo em ordem.',
        ],
        ctaLabel: 'Regularizar',
        ctaKey: 'link',
        destaque: 'atencao',
      }
    case 'd_mais_8':
      return {
        subject: `Seu acesso ao Aveto 360 será suspenso em ${d.dataSuspensao ?? '3 dias'}`,
        heading: 'Em 3 dias o acesso será suspenso',
        paragraphs: [
          `${nome(d)}, a fatura de ${valor(d)} está em atraso há 8 dias.`,
          `Para evitar a suspensão do acesso da ${empresa(d)} em ${d.dataSuspensao ?? '3 dias'}, pague até lá.`,
          'O Portal do Colaborador continuará disponível para a sua equipe.',
        ],
        ctaLabel: 'Pagar e manter o acesso',
        ctaKey: 'link',
        destaque: 'urgente',
      }
    case 'd_mais_10':
      return {
        subject: 'Amanhã o acesso ao Aveto 360 será suspenso',
        heading: 'Amanhã o acesso será suspenso',
        paragraphs: [
          `${nome(d)}, a fatura de ${valor(d)} está em atraso há 10 dias.`,
          `Se o pagamento não for identificado até amanhã, o acesso operacional da ${empresa(d)} será suspenso.`,
        ],
        ctaLabel: 'Pagar agora',
        ctaKey: 'link',
        destaque: 'urgente',
      }
    case 'd_mais_11':
      return {
        subject: 'Acesso ao Aveto 360 suspenso por pendência financeira',
        heading: 'Acesso suspenso',
        paragraphs: [
          `${nome(d)}, o acesso operacional da ${empresa(d)} foi suspenso por falta de pagamento da fatura de ${valor(d)}.`,
          'Seus dados estão preservados, e os administradores podem exportá-los normalmente.',
          'Após a confirmação do pagamento, o acesso é liberado automaticamente.',
        ],
        ctaLabel: 'Pagar e reativar',
        ctaKey: 'link',
        destaque: 'urgente',
        formal: true,
      }
    case 'd_mais_20':
      return {
        subject: 'Acesso suspenso: regularize para reativar o Aveto 360',
        heading: 'Seu acesso segue suspenso',
        paragraphs: [
          `${nome(d)}, a fatura de ${valor(d)} continua em aberto e o acesso da ${empresa(d)} segue suspenso.`,
          `Sem a quitação, o contrato será rescindido em ${d.dataRescisao ?? '—'}.`,
          'Os administradores continuam podendo exportar os dados.',
        ],
        ctaLabel: 'Regularizar',
        ctaKey: 'link',
        destaque: 'urgente',
      }
    case 'd_mais_28':
      return {
        subject: `Em 3 dias o contrato Aveto 360 será rescindido`,
        heading: 'Em 3 dias o contrato será rescindido',
        paragraphs: [
          `${nome(d)}, a fatura de ${valor(d)} está em atraso há 28 dias.`,
          `Se a pendência não for resolvida até ${d.dataRescisao ?? '—'}, o contrato da ${empresa(d)} será rescindido por inadimplência.`,
        ],
        ctaLabel: 'Pagar e manter o contrato',
        ctaKey: 'link',
        destaque: 'urgente',
      }
    case 'd_mais_31':
      return {
        subject: 'Notificação de rescisão do contrato Aveto 360',
        heading: 'Notificação de rescisão contratual',
        paragraphs: [
          `Prezado(a) ${d.nome ?? 'cliente'}, informamos que o contrato de licença de uso do Aveto 360 firmado com ${empresa(d)}${d.cnpj ? ` (CNPJ ${d.cnpj})` : ''} foi rescindido em ${d.data ?? 'nesta data'} por inadimplência superior a 30 dias, conforme os Termos de Uso.`,
          `O débito em aberto é de ${valor(d)}.`,
          `Os dados da empresa permanecerão armazenados e disponíveis para exportação pelos administradores até ${d.dataExpiracao ?? '—'}. Após essa data, serão excluídos definitivamente.`,
          'Para regularizar e reativar a conta, utilize o botão abaixo.',
        ],
        ctaLabel: 'Regularizar e reativar',
        ctaKey: 'link',
        destaque: 'urgente',
        formal: true,
      }
    case 'd_mais_60':
      return {
        subject: `Exporte os dados da ${d.empresa ?? 'sua empresa'} antes de ${d.dataExpiracao ?? 'o prazo final'}`,
        heading: 'Lembrete de exportação dos dados',
        paragraphs: [
          `${nome(d)}, o contrato da ${empresa(d)} está rescindido e os dados ficam disponíveis para exportação até ${d.dataExpiracao ?? '—'}.`,
          'Os administradores podem baixar lançamentos, relatórios e dados da equipe a qualquer momento antes dessa data.',
        ],
        ctaLabel: 'Exportar dados',
        ctaKey: 'linkExportacao',
        destaque: 'atencao',
      }
    case 'd_mais_80':
      return {
        subject: `Últimos 10 dias para exportar os dados da ${d.empresa ?? 'sua empresa'}`,
        heading: 'Últimos 10 dias para exportar',
        paragraphs: [
          `${nome(d)}, em ${d.dataExpiracao ?? '10 dias'} os dados da ${empresa(d)} no Aveto 360 deixarão de estar disponíveis e serão excluídos definitivamente.`,
          'Exporte agora pelo botão abaixo ou regularize a pendência para reativar a conta.',
        ],
        ctaLabel: 'Exportar dados agora',
        ctaKey: 'linkExportacao',
        destaque: 'urgente',
        formal: true,
      }
    case 'd_mais_90':
      return {
        subject: 'Encerramento definitivo da conta Aveto 360',
        heading: 'Conta encerrada definitivamente',
        paragraphs: [
          `${nome(d)}, o prazo de guarda de 90 dias da ${empresa(d)} foi encerrado e os dados não estão mais disponíveis para exportação.`,
          'Se desejar voltar a usar o Aveto 360, é possível iniciar um novo contrato a qualquer momento.',
        ],
        ctaLabel: 'Ver planos',
        ctaKey: 'linkPlanos',
        formal: true,
      }
    case 'reativacao':
      return {
        subject: 'Pagamento confirmado: acesso liberado',
        heading: 'Pagamento confirmado',
        paragraphs: [
          `Obrigado, ${nome(d)}! Recebemos o pagamento de ${valor(d)}.`,
          `O acesso da ${empresa(d)} está normal.`,
          'A nota fiscal estará disponível em Plano e Assinatura assim que for emitida.',
        ],
        ctaLabel: 'Ver plano e faturas',
        ctaKey: 'link',
      }
    case 'trial_d5':
      return {
        subject: 'Seu teste do Aveto 360 termina em 2 dias',
        heading: 'Seu teste termina em 2 dias',
        paragraphs: [
          `Olá, ${nome(d)}! O teste gratuito da ${empresa(d)} no Aveto 360 termina em 2 dias.`,
          'Escolha um plano para manter o acesso sem interrupção.',
        ],
        ctaLabel: 'Ver planos',
        ctaKey: 'linkPlanos',
        destaque: 'atencao',
      }
    case 'trial_d7':
      return {
        subject: 'Seu teste do Aveto 360 terminou',
        heading: 'Seu teste terminou',
        paragraphs: [
          `${nome(d)}, o período de teste da ${empresa(d)} terminou hoje.`,
          'Para voltar a usar o sistema, escolha um plano pelo botão abaixo. Seus dados continuam guardados.',
        ],
        ctaLabel: 'Escolher um plano',
        ctaKey: 'linkPlanos',
        destaque: 'urgente',
      }
    case 'trial_pos_3':
      return {
        subject: 'Podemos ajudar na implantação do Aveto 360?',
        heading: 'Podemos ajudar na implantação?',
        paragraphs: [
          `Olá, ${nome(d)}! Notamos que o teste da ${empresa(d)} terminou sem a escolha de um plano.`,
          'Se ficou alguma dúvida sobre conciliação bancária, contas a pagar ou gestão da equipe, nosso time pode apoiar na configuração inicial.',
        ],
        ctaLabel: 'Ver planos',
        ctaKey: 'linkPlanos',
      }
    case 'trial_pos_10':
      return {
        subject: 'Ainda dá tempo de retomar o Aveto 360',
        heading: 'Ainda dá tempo de retomar',
        paragraphs: [
          `${nome(d)}, os dados da ${empresa(d)} continuam guardados e você pode retomar o uso quando quiser.`,
          'Este é o nosso último contato sobre o teste. Se precisar de algo, basta responder este e-mail.',
        ],
        ctaLabel: 'Ver planos',
        ctaKey: 'linkPlanos',
      }
    case 'cortesia_encerrada':
      return {
        subject: `Sua cortesia${modulo(d)} no Aveto 360 foi encerrada`,
        heading: 'Sua cortesia foi encerrada',
        paragraphs: [
          `Olá, ${nome(d)}! A cortesia${modulo(d)} da ${empresa(d)} no Aveto 360 foi encerrada.`,
          `Para você não perder o acesso, liberamos um período de carência até ${d.data ?? 'os próximos dias'}. Escolha um plano até essa data para continuar usando o sistema sem interrupção.`,
          'Seus dados continuam guardados. Se tiver dúvidas, basta responder este e-mail.',
        ],
        ctaLabel: 'Escolher plano',
        ctaKey: 'linkPlanos',
        destaque: 'atencao',
      }
    case 'grace_d_menos_3':
      return {
        subject: 'Faltam 3 dias para o fim da carência no Aveto 360',
        heading: 'Faltam 3 dias para o fim da carência',
        paragraphs: [
          `Olá, ${nome(d)}! O período de carência${modulo(d)} da ${empresa(d)} termina em ${d.data ?? 'breve'}.`,
          'Escolha um plano para manter o acesso ao sistema sem interrupção.',
        ],
        ctaLabel: 'Escolher plano',
        ctaKey: 'linkPlanos',
      }
    case 'grace_d_menos_1':
      return {
        subject: 'Amanhã termina a carência no Aveto 360',
        heading: 'Amanhã é o último dia da carência',
        paragraphs: [
          `${nome(d)}, o período de carência${modulo(d)} da ${empresa(d)} termina amanhã, ${d.data ?? ''}.`,
          'Depois dessa data o acesso fica suspenso até a contratação de um plano.',
        ],
        ctaLabel: 'Escolher plano',
        ctaKey: 'linkPlanos',
        destaque: 'atencao',
      }
    case 'grace_d0':
      return {
        subject: 'Seu período de carência no Aveto 360 termina hoje',
        heading: 'Sua carência termina hoje',
        paragraphs: [
          `${nome(d)}, hoje é o último dia da carência${modulo(d)} da ${empresa(d)}.`,
          'A partir de amanhã o acesso fica suspenso até a contratação de um plano. Seus dados continuam guardados.',
        ],
        ctaLabel: 'Escolher plano',
        ctaKey: 'linkPlanos',
        destaque: 'urgente',
      }
    default:
      return {
        subject: 'Aveto 360',
        heading: 'Aviso da sua assinatura',
        paragraphs: ['Acesse Plano e Assinatura para ver os detalhes.'],
        ctaLabel: 'Abrir Aveto 360',
        ctaKey: 'link',
      }
  }
}
