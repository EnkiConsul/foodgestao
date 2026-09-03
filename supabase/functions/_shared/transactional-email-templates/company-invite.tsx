import * as React from 'npm:react@18.3.1'
import { Button, Heading, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout } from '../email-templates/EmailLayout.tsx'

const SITE_NAME = 'Aveto 360'
const SITE_URL = 'https://www.aveto360.com'

interface CompanyInviteProps {
  companyName?: string
  inviterName?: string
  role?: string
  inviteUrl?: string
}

const roleLabel = (r?: string) => {
  switch (r) {
    case 'owner': return 'Dono'
    case 'admin': return 'Admin'
    case 'viewer': return 'Visualizador'
    default: return 'Membro'
  }
}

const CompanyInviteEmail = ({ companyName, inviterName, role, inviteUrl }: CompanyInviteProps) => (
  <EmailLayout
    siteUrl={SITE_URL}
    siteName={SITE_NAME}
    preview={`Você foi convidado para ${companyName ?? 'uma empresa'} no ${SITE_NAME}`}
  >
    <Heading style={h1}>Você recebeu um convite</Heading>
    <Text style={text}>
      {inviterName ? <><strong>{inviterName}</strong> convidou você</> : 'Você foi convidado'}{' '}
      para participar de <strong>{companyName ?? 'uma empresa'}</strong> no {SITE_NAME} como{' '}
      <strong>{roleLabel(role)}</strong>.
    </Text>

    <Section style={{ textAlign: 'center', margin: '28px 0' }}>
      <Button href={inviteUrl} style={cta}>
        Aceitar convite
      </Button>
    </Section>

    <Text style={smallText}>
      Se o botão não funcionar, copie e cole este link no seu navegador:
    </Text>
    <Text style={linkText}>{inviteUrl}</Text>
    <Text style={footer}>
      Se você não esperava este convite, pode ignorar este e-mail com segurança.
    </Text>
  </EmailLayout>
)

export const template = {
  component: CompanyInviteEmail,
  subject: (d: Record<string, any>) =>
    d?.companyName ? `Convite para ${d.companyName} no ${SITE_NAME}` : `Você foi convidado para o ${SITE_NAME}`,
  displayName: 'Convite — Acesso à empresa',
  previewData: {
    companyName: 'Empresa Exemplo LTDA',
    inviterName: 'João da Silva',
    role: 'member',
    inviteUrl: 'https://www.aveto360.com/convite/abc123',
  },
} satisfies TemplateEntry

const h1 = { fontSize: '22px', fontWeight: 700, color: '#0B0F0D', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#4B5563', lineHeight: '1.6', margin: '0 0 16px' }
const smallText = { fontSize: '13px', color: '#6B7280', lineHeight: '1.5', margin: '24px 0 4px' }
const linkText = { fontSize: '12px', color: '#02AB3D', wordBreak: 'break-all' as const, margin: '0 0 16px' }
const cta = {
  backgroundColor: '#02AB3D',
  color: '#FFFFFF',
  padding: '12px 24px',
  borderRadius: '8px',
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: '15px',
  display: 'inline-block',
}
const footer = { fontSize: '12px', color: '#9CA3AF', margin: '24px 0 0' }
