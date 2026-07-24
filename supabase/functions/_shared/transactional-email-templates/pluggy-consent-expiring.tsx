import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = '360°FOOD'

interface Props {
  userName?: string
  institutionName?: string
  accountName?: string
  daysRemaining?: number
  expiresAt?: string
  reconnectUrl?: string
}

const ConsentExpiringEmail = ({
  userName,
  institutionName,
  accountName,
  daysRemaining,
  expiresAt,
  reconnectUrl,
}: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>
      Sua conexão Open Finance com {institutionName ?? 'seu banco'} expira em {daysRemaining ?? 7} dias
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Renove sua conexão bancária</Heading>
        <Text style={text}>
          {userName ? <>Olá, <strong>{userName}</strong>.</> : 'Olá.'}
        </Text>
        <Text style={text}>
          A conexão Open Finance da sua conta{' '}
          <strong>{accountName ?? institutionName ?? 'bancária'}</strong> no {SITE_NAME}{' '}
          expira em <strong>{daysRemaining ?? 7} dias</strong>
          {expiresAt ? <> (em {new Date(expiresAt).toLocaleDateString('pt-BR')})</> : null}.
        </Text>
        <Text style={text}>
          Sem a renovação, os lançamentos deixarão de ser importados automaticamente.
          Reconecte agora — leva menos de 1 minuto.
        </Text>

        <Section style={{ textAlign: 'center', margin: '24px 0' }}>
          <Button href={reconnectUrl} style={cta}>
            Renovar conexão
          </Button>
        </Section>

        <Text style={smallText}>
          Se o botão não funcionar, copie e cole este link no seu navegador:
        </Text>
        <Text style={linkText}>{reconnectUrl}</Text>

        <Hr style={hr} />
        <Text style={footer}>
          Este é um aviso automático do {SITE_NAME}. Você recebeu porque possui uma conexão
          Open Finance ativa próxima do vencimento.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ConsentExpiringEmail,
  subject: (d: Record<string, any>) =>
    `Sua conexão com ${d?.institutionName ?? 'seu banco'} expira em ${d?.daysRemaining ?? 7} dias`,
  displayName: 'Open Finance — Consentimento expirando',
  previewData: {
    userName: 'Maria',
    institutionName: 'Itaú',
    accountName: 'Itaú — Conta Corrente',
    daysRemaining: 7,
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    reconnectUrl: 'https://360food.com/contas',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 700, color: '#0F1B3D', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#334155', lineHeight: '1.6', margin: '0 0 16px' }
const smallText = { fontSize: '13px', color: '#64748b', lineHeight: '1.5', margin: '24px 0 4px' }
const linkText = { fontSize: '12px', color: '#EB6119', wordBreak: 'break-all' as const, margin: '0 0 16px' }
const cta = {
  backgroundColor: '#EB6119',
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
