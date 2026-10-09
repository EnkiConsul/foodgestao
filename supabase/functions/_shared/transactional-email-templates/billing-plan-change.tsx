import * as React from 'npm:react@18.3.1'
import { Button, Heading, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout } from '../email-templates/EmailLayout.tsx'

const SITE_URL = 'https://www.aveto360.com'

interface Props {
  nome?: string
  resultado?: 'aplicada' | 'bloqueada' | 'cancelada'
  planoAtual?: string
  planoNovo?: string
  valor?: string
  motivo?: string
}

const titulo = (r?: string) =>
  r === 'aplicada' ? 'Sua troca de plano foi aplicada'
  : r === 'cancelada' ? 'Sua assinatura foi encerrada'
  : 'Não foi possível aplicar a troca de plano'

const Email = (p: Props) => (
  <EmailLayout siteUrl={SITE_URL} siteName="Aveto 360" preview={titulo(p.resultado)}>
    <Heading style={h1}>{titulo(p.resultado)}</Heading>
    <Text style={text}>Olá{p.nome ? `, ${p.nome}` : ''}.</Text>
    {p.resultado === 'aplicada' && (
      <Text style={text}>Na renovação de hoje, sua assinatura passou para o plano {p.planoNovo}. O novo valor é {p.valor}.</Text>
    )}
    {p.resultado === 'bloqueada' && (
      <>
        <Text style={text}>A troca agendada para o plano {p.planoNovo} não foi aplicada porque o uso atual passa da franquia desse plano. Seu plano {p.planoAtual} continua ativo, sem mudança no valor.</Text>
        <Text style={text}>Motivo: {p.motivo}</Text>
        <Text style={text}>Para trocar, ajuste o uso e agende de novo na sua assinatura.</Text>
      </>
    )}
    {p.resultado === 'cancelada' && (
      <Text style={text}>Conforme solicitado, a assinatura do plano {p.planoAtual} foi encerrada no fim do ciclo. Você pode contratar de novo quando quiser.</Text>
    )}
    <Section style={{ textAlign: 'center', margin: '28px 0' }}>
      <Button href={`${SITE_URL}/assinatura`} style={btn}>Ver Minha Assinatura</Button>
    </Section>
  </EmailLayout>
)

const h1 = { fontSize: '20px', color: '#0F1B3D', margin: '0 0 16px' }
const text = { fontSize: '14px', lineHeight: '22px', color: '#333' }
const btn = { backgroundColor: '#EB6119', color: '#ffffff', padding: '12px 22px', borderRadius: '6px', fontSize: '14px', textDecoration: 'none' }

export const template: TemplateEntry = {
  component: Email,
  subject: (d) => titulo(d.resultado),
  displayName: 'Troca de plano na renovação',
  previewData: { nome: 'Rafael', resultado: 'bloqueada', planoAtual: 'Financeiro Multiempresa', planoNovo: 'Financeiro Essencial', motivo: 'Uso de empresas (2) acima do limite do novo plano (1)' },
}
