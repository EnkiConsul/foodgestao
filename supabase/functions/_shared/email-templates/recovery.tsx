/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Redefina sua senha do {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar}>
          <Text style={brand}>
            <span style={brandOrange}>360°</span>
            <span style={brandNavy}>FOOD</span>
          </Text>
        </Section>
        <Heading style={h1}>Redefinir senha</Heading>
        <Text style={text}>
          Recebemos um pedido para redefinir a senha da sua conta no {siteName}.
          Clique no botão abaixo para escolher uma nova senha.
        </Text>
        <Section style={{ textAlign: 'center' as const }}>
          <Button style={button} href={confirmationUrl}>
            Redefinir senha
          </Button>
        </Section>
        <Text style={footer}>
          Se você não solicitou a redefinição, pode ignorar este e-mail — sua
          senha atual continua válida.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }
const container = { padding: '32px 28px', maxWidth: '560px' }
const brandBar = { paddingBottom: '24px', borderBottom: '1px solid hsl(30, 15%, 88%)', marginBottom: '28px' }
const brand = { fontSize: '22px', fontWeight: 'bold' as const, letterSpacing: '0.5px', margin: 0 }
const brandOrange = { color: 'hsl(18, 84%, 51%)' }
const brandNavy = { color: 'hsl(224, 60%, 12%)' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: 'hsl(224, 60%, 12%)', margin: '0 0 20px' }
const text = { fontSize: '15px', color: 'hsl(224, 15%, 40%)', lineHeight: '1.6', margin: '0 0 20px' }
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
