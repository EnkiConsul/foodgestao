import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Aveto 360'

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
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Você foi convidado para {companyName ?? 'uma empresa'} no {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Você recebeu um convite</Heading>
        <Text style={text}>
          {inviterName ? <><strong>{inviterName}</strong> convidou você</> : 'Você foi convidado'}{' '}
          para participar de <strong>{companyName ?? 'uma empresa'}</strong> no {SITE_NAME} como{' '}
          <strong>{roleLabel(role)}</strong>.
        </Text>

        <Section style={{ textAlign: 'center', margin: '24px 0' }}>
          <Button href={inviteUrl} style={cta}>
            Aceitar convite
          </Button>
        </Section>

        <Text style={smallText}>
          Se o botão não funcionar, copie e cole este link no seu navegador:
        </Text>
        <Text style={linkText}>{inviteUrl}</Text>

        <Hr style={hr} />
        <Text style={footer}>
          Se você não esperava este convite, pode ignorar este e-mail com segurança.
        </Text>
      </Container>
    </Body>
  </Html>
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
    inviteUrl: 'https://360food.com/convite/abc123',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#334155', lineHeight: '1.6', margin: '0 0 16px' }
const smallText = { fontSize: '13px', color: '#64748b', lineHeight: '1.5', margin: '24px 0 4px' }
const linkText = { fontSize: '12px', color: '#22C9A0', wordBreak: 'break-all' as const, margin: '0 0 16px' }
const cta = {
  backgroundColor: '#22C9A0',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '8px',
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: '15px',
  display: 'inline-block',
}
const hr = { borderColor: '#e2e8f0', margin: '24px 0 12px' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '0' }
