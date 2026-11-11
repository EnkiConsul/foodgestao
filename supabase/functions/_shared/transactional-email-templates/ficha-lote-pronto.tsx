import * as React from 'npm:react@18.3.1'
import { Button, Heading, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout } from '../email-templates/EmailLayout.tsx'

const SITE_NAME = 'AVETO 360'
const SITE_URL = 'https://aveto360.com'

interface Props {
  nome?: string
  empresa?: string
  fichas?: number
  link?: string
}

const primeiro = (n?: string) => {
  const p = String(n ?? '').trim().split(/\s+/)[0] ?? ''
  if (!p || p.includes('@')) return ''
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
}

const FichaLoteProntoEmail = ({ nome, empresa, fichas, link }: Props) => {
  const n = primeiro(nome)
  const emp = empresa || 'sua empresa'
  const qtd = typeof fichas === 'number' && fichas > 0
    ? (fichas === 1 ? 'a ficha de registro' : `as ${fichas} fichas de registro`)
    : 'as fichas de registro'
  return (
    <EmailLayout siteUrl={SITE_URL} siteName={SITE_NAME} preview={`Fichas da ${emp} prontas para conferência`}>
      <Heading style={h1}>Fichas prontas para conferência</Heading>
      <Text style={text}>Olá{n ? `, ${n}` : ''}! Aqui é da equipe da {SITE_NAME}.</Text>
      <Text style={text}>
        Já organizamos {qtd} da <strong>{emp}</strong>: unidade, cargos e setores estão configurados.
      </Text>
      <Text style={text}>Agora é só conferir os dados da sua equipe e concluir os cadastros.</Text>
      {link ? (
        <>
          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button href={link} style={cta}>Conferir as fichas</Button>
          </Section>
          <Text style={smallText}>Se o botão não funcionar, copie e cole este link no navegador:</Text>
          <Text style={linkText}>{link}</Text>
        </>
      ) : null}
      <Text style={text}>Qualquer dúvida, estamos por aqui!</Text>
    </EmailLayout>
  )
}

export const template = {
  component: FichaLoteProntoEmail,
  subject: (d: Record<string, any>) =>
    d?.empresa ? `Fichas da ${d.empresa} prontas para conferência — AVETO 360` : 'Fichas prontas para conferência — AVETO 360',
  displayName: 'Fichas de registro prontas (repasse da Aveto)',
  previewData: { nome: 'Maria Eduarda', empresa: 'Restaurante Exemplo', fichas: 12, link: 'https://aveto360.com/dp/colaboradores/importar-ficha?lote=exemplo' },
} satisfies TemplateEntry

const h1 = { fontSize: '22px', fontWeight: 700, color: '#0B0F0D', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#4B5563', lineHeight: '1.6', margin: '0 0 16px' }
const smallText = { fontSize: '13px', color: '#6B7280', lineHeight: '1.5', margin: '24px 0 4px' }
const linkText = { fontSize: '12px', color: '#02AB3D', wordBreak: 'break-all' as const, margin: '0 0 16px' }
const cta = {
  backgroundColor: '#02AB3D', color: '#FFFFFF', padding: '12px 24px', borderRadius: '8px',
  textDecoration: 'none', fontWeight: 600, fontSize: '15px', display: 'inline-block',
}
