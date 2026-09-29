import * as React from 'npm:react@18.3.1'
import { Button, Heading, Hr, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout } from '../email-templates/EmailLayout.tsx'
import { billingCopy, type BillingCopyData } from './billing-copy.ts'

const SITE_NAME = 'Aveto 360'
const SITE_URL = 'https://www.aveto360.com'

interface Props extends BillingCopyData {
  stage?: string
}

const BillingDunningEmail = (props: Props) => {
  const copy = billingCopy(props.stage ?? 'd_menos_3', props)
  const ctaUrl =
    (copy.ctaKey === 'linkExportacao' ? props.linkExportacao : undefined) ??
    (copy.ctaKey === 'linkPlanos' ? props.linkPlanos : undefined) ??
    props.link ??
    `${SITE_URL}/assinatura`

  const barra =
    copy.destaque === 'urgente' ? urgente : copy.destaque === 'atencao' ? atencao : neutro

  return (
    <EmailLayout siteUrl={SITE_URL} siteName={SITE_NAME} preview={copy.subject}>
      <Section style={barra}>
        <Text style={barraTexto}>{copy.heading}</Text>
      </Section>

      <Heading style={h1}>{copy.heading}</Heading>

      {copy.paragraphs.map((p, i) => (
        <Text key={i} style={text}>
          {p}
        </Text>
      ))}

      {copy.ctaLabel ? (
        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button href={ctaUrl} style={cta}>
            {copy.ctaLabel}
          </Button>
        </Section>
      ) : null}

      <Hr style={hr} />
      <Text style={footer}>
        Este é o canal oficial de comunicação da sua assinatura no {SITE_NAME}. Em caso de dúvida
        sobre valores ou prazos, responda este e-mail.
      </Text>
    </EmailLayout>
  )
}

export const template = {
  component: BillingDunningEmail,
  subject: (d: Record<string, any>) => billingCopy(d?.stage ?? 'd_menos_3', d ?? {}).subject,
  displayName: 'Cobrança — Régua da assinatura',
  previewData: {
    stage: 'd_mais_8',
    nome: 'Rafael',
    empresa: 'PAKERÊ PIZZARIA LTDA',
    cnpj: '12.345.678/0001-90',
    valor: 'R$ 249,00',
    data: '20/09/2026',
    dataSuspensao: '01/10/2026',
    dataRescisao: '21/10/2026',
    dataExpiracao: '19/12/2026',
    link: 'https://www.aveto360.com/assinatura',
    linkExportacao: 'https://www.aveto360.com/acesso-bloqueado',
    linkPlanos: 'https://www.aveto360.com/planos',
  },
} satisfies TemplateEntry

const h1 = { fontSize: '22px', fontWeight: 700, color: '#0F1B3D', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#4B5563', lineHeight: '1.6', margin: '0 0 14px' }
const hr = { borderColor: '#E5E7EB', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: '#9CA3AF', lineHeight: '1.5', margin: '0' }
const barraTexto = { fontSize: '13px', fontWeight: 700, color: '#FFFFFF', margin: '0' }
const barraBase = { borderRadius: '8px', padding: '10px 14px', margin: '0 0 20px' }
const neutro = { ...barraBase, backgroundColor: '#0F1B3D' }
const atencao = { ...barraBase, backgroundColor: '#EB6119' }
const urgente = { ...barraBase, backgroundColor: '#B91C1C' }
const cta = {
  backgroundColor: '#EB6119',
  color: '#FFFFFF',
  padding: '13px 26px',
  borderRadius: '8px',
  textDecoration: 'none',
  fontWeight: 700,
  fontSize: '15px',
  display: 'inline-block',
}
