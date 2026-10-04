export interface ParsedVoto {
  numeroCandidato: string
  numeroPartido: string
  qtdVotos: number
}

export interface ParsedCargo {
  codigoCargo: string
  votos: ParsedVoto[]
}

export interface ParsedBoletim {
  idca: string
  idue: string
  municipio: string
  zona: number
  local: string
  cargos: ParsedCargo[]
}

interface QrPart {
  indice: number
  total: number
  conteudo: string
}

function inferNumeroPartido(numeroCandidato: string): string {
  if (!numeroCandidato) return ""
  return numeroCandidato.slice(0, 2)
}

// Step 1: Extract QRBU metadata and validate
function extractQrMetadata(qrText: string): { indice: number; total: number } | null {
  const match = qrText.match(/QRBU:(\d+):(\d+)/)
  if (!match) return null
  return { indice: parseInt(match[1], 10), total: parseInt(match[2], 10) }
}

// Step 2: Order and validate sequence
function orderAndValidate(qrTexts: string[]): QrPart[] {
  const parts: QrPart[] = []
  let totalExpected: number | null = null

  for (const qrText of qrTexts) {
    const meta = extractQrMetadata(qrText)
    if (!meta) throw new Error("Invalid QR code: missing QRBU metadata")

    if (totalExpected === null) {
      totalExpected = meta.total
    } else if (totalExpected !== meta.total) {
      throw new Error("Inconsistent QR code total counts")
    }

    parts.push({ indice: meta.indice, total: meta.total, conteudo: qrText })
  }

  // Sort by index
  parts.sort((a, b) => a.indice - b.indice)

  // Validate sequence is continuous from 1 to total
  if (parts.length !== totalExpected) {
    throw new Error(`Expected ${totalExpected} QR codes, got ${parts.length}`)
  }
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].indice !== i + 1) {
      throw new Error(`QR code sequence broken: expected index ${i + 1}, got ${parts[i].indice}`)
    }
  }

  return parts
}

// Step 3: Clean cryptographic footers
function cleanCryptoFields(text: string, isLastPart: boolean): string {
  // Remove HASH:[A-F0-9]+
  let cleaned = text.replace(/HASH:[A-F0-9]+/gi, "")
  // Remove ASSI:[A-F0-9]+ only in last part
  if (isLastPart) {
    cleaned = cleaned.replace(/ASSI:[A-F0-9]+/gi, "")
  }
  return cleaned
}

// Step 4: Concatenate and tokenize
function concatenateAndTokenize(parts: QrPart[]): string[] {
  const cleaned = parts.map((p, idx) => cleanCryptoFields(p.conteudo, idx === parts.length - 1)).join(" ")
  return cleaned.split(/\s+/).filter(Boolean)
}

// Step 5: State machine parsing
function parseTokens(tokens: string[]): ParsedBoletim {
  const result: ParsedBoletim = {
    idca: "",
    idue: "",
    municipio: "",
    zona: 0,
    local: "",
    cargos: [],
  }

  let cargoAtual: ParsedCargo | null = null
  let partidoAtual = ""

  for (const token of tokens) {
    const colonIdx = token.indexOf(":")
    if (colonIdx === -1) continue

    const key = token.slice(0, colonIdx)
    const value = token.slice(colonIdx + 1)

    if (key === "MUNI") {
      result.municipio = value
    } else if (key === "ZONA") {
      result.zona = parseInt(value, 10)
    } else if (key === "LOCA") {
      result.local = value
    } else if (key === "IDUE") {
      result.idue = value
    } else if (key === "IDCA") {
      result.idca = value
    } else if (key === "CARG") {
      cargoAtual = { codigoCargo: value, votos: [] }
      result.cargos.push(cargoAtual)
      partidoAtual = ""
    } else if (key === "PART") {
      partidoAtual = value
    } else if (/^\d+$/.test(key) && /^\d+$/.test(value)) {
      if (!cargoAtual) throw new Error("Voto encontrado sem cargo ativo")

      const numeroCandidato = key
      const qtdVotos = parseInt(value, 10)
      const numeroPartido = partidoAtual || inferNumeroPartido(numeroCandidato)

      cargoAtual.votos.push({ numeroCandidato, numeroPartido, qtdVotos })
    }
  }

  return result
}

export function parseQrTexts(qr1: string, qr2: string): ParsedBoletim {
  const qrTexts = [qr1, qr2].filter(Boolean)
  const parts = orderAndValidate(qrTexts)
  const tokens = concatenateAndTokenize(parts)
  return parseTokens(tokens)
}
