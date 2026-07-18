/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu código de verificação</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar}>
          <Text style={brand}>
            <span style={brandOrange}>360°</span>
            <span style={brandNavy}>FOOD</span>
          </Text>
        </Section>
        <Heading style={h1}>Confirme sua identidade</Heading>
        <Text style={text}>Use o código abaixo para confirmar sua identidade:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          O código expira em alguns minutos. Se você não solicitou esta ação,
          pode ignorar este e-mail.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }
const container = { padding: '32px 28px', maxWidth: '560px' }
const brandBar = { paddingBottom: '24px', borderBottom: '1px solid hsl(30, 15%, 88%)', marginBottom: '28px' }
const brand = { fontSize: '22px', fontWeight: 'bold' as const, letterSpacing: '0.5px', margin: 0 }
const brandOrange = { color: 'hsl(18, 84%, 51%)' }
const brandNavy = { color: 'hsl(224, 60%, 12%)' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: 'hsl(224, 60%, 12%)', margin: '0 0 20px' }
const text = { fontSize: '15px', color: 'hsl(224, 15%, 40%)', lineHeight: '1.6', margin: '0 0 20px' }
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: 'hsl(18, 84%, 51%)',
  letterSpacing: '4px',
  margin: '0 0 30px',
}
const footer = { fontSize: '12px', color: 'hsl(224, 15%, 55%)', margin: '32px 0 0', lineHeight: '1.5' }
