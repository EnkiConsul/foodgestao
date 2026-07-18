/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Você foi convidado para o {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar}>
          <Text style={brand}>
            <span style={brandOrange}>360°</span>
            <span style={brandNavy}>FOOD</span>
          </Text>
        </Section>
        <Heading style={h1}>Você foi convidado</Heading>
        <Text style={text}>
          Você recebeu um convite para acessar o{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          . Clique no botão abaixo para aceitar e criar sua conta.
        </Text>
        <Section style={{ textAlign: 'center' as const }}>
          <Button style={button} href={confirmationUrl}>
            Aceitar convite
          </Button>
        </Section>
        <Text style={footer}>
          Se você não esperava este convite, pode ignorar este e-mail com
          segurança.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }
const container = { padding: '32px 28px', maxWidth: '560px' }
const brandBar = { paddingBottom: '24px', borderBottom: '1px solid hsl(30, 15%, 88%)', marginBottom: '28px' }
const brand = { fontSize: '22px', fontWeight: 'bold' as const, letterSpacing: '0.5px', margin: 0 }
const brandOrange = { color: 'hsl(18, 84%, 51%)' }
const brandNavy = { color: 'hsl(224, 60%, 12%)' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: 'hsl(224, 60%, 12%)', margin: '0 0 20px' }
const text = { fontSize: '15px', color: 'hsl(224, 15%, 40%)', lineHeight: '1.6', margin: '0 0 20px' }
const link = { color: 'hsl(18, 84%, 51%)', textDecoration: 'underline' }
const button = {
  backgroundColor: 'hsl(18, 84%, 51%)',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  borderRadius: '12px',
  padding: '14px 28px',
  textDecoration: 'none',
  display: 'inline-block',
  margin: '8px 0 24px',
}
const footer = { fontSize: '12px', color: 'hsl(224, 15%, 55%)', margin: '32px 0 0', lineHeight: '1.5' }
