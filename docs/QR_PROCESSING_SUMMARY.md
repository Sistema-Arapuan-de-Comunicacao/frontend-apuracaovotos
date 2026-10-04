# QR CODE Processing Summary

## Overview
Sistema de leitura e processamento de QR codes de Boletim de Urna (BU) com suporte a múltiplos QR codes sequenciais.

## Fluxo de Processamento

### 1. **Entrada (Input)**
- Recebe dois textos QR: `qr1` e `qr2`
- Padrão: `QRBU:1:2` (parte 1 de 2) e `QRBU:2:2` (parte 2 de 2)

### 2. **Extração e Validação de Metadados** (`extractQrMetadata`)
```
QRBU:i:n → { indice: i, total: n }
```
- Extrai índice atual (`i`) e total esperado (`n`)
- Valida presença do padrão `QRBU`

### 3. **Ordenação e Validação de Sequência** (`orderAndValidate`)
- Ordena QR codes por índice ascendente
- Valida continuidade: 1, 2, ..., n
- Rejeita se sequência quebrada ou incompleta

### 4. **Limpeza de Rodapés Criptográficos** (`cleanCryptoFields`)
- Remove `HASH:[A-F0-9]+` de todas as partes
- Remove `ASSI:[A-F0-9]+` apenas da última parte
- Mantém payload de dados íntegro

### 5. **Concatenação e Tokenização** (`concatenateAndTokenize`)
- Junta partes limpas com espaço: `parte1 + " " + parte2`
- Split por regex `/\s+/`: divide em tokens
- Resultado: array linear de strings

### 6. **State Machine Parsing** (`parseTokens`)

#### Contexto Mantido:
```typescript
localizacao: { municipio, zona, local }
cargoAtual: { codigoCargo, votos[] }
partidoAtual: string
```

#### Regras por Token:

| Token | Ação |
|-------|------|
| `MUNI:xxxx` | Define `municipio` |
| `ZONA:n` | Define `zona` |
| `LOCA:xxx` | Define `local` |
| `IDCA:xxxx` | Define `idca` (chave única) |
| `IDUE:xxxx` | Define `idue` |
| `CARG:nn` | Novo cargo; reseta `partidoAtual` |
| `PART:nn` | Define `partidoAtual` |
| `\d+:\d+` | Voto: `numeroCandidato:qtdVotos` |

#### Lógica de Voto:
```typescript
For each "numero:qtd" token:
  numeroCandidato = numero
  qtdVotos = qtd
  numeroPartido = partidoAtual || numero.slice(0, 2)
  Add to cargoAtual.votos[]
```

### 7. **Resolução de Chaves Estrangeiras (FK)**

#### Local de Votação:
1. Busca por `codigo_local` → `local_votacao.id`
2. Se não encontrar, busca por `municipio + zona` → `municipios.id` + `local_votacao.id`
3. Retorna `localVotacaoId`

#### Candidatos:
```typescript
For each voto:
  candidato = SELECT FROM candidatos
              WHERE numero_candidato = voto.numeroCandidato
               OR numero_partido = voto.numeroPartido
  
  if (found):
    fk_idcandidato = candidato.id
    numero_partido = candidato.numero_partido
  else:
    fk_idcandidato = null
    Add to unmatched[]
```

## Estrutura de Saída (JSON)

```json
{
  "boletim": {
    "idca": "166315320523373755377726"
  },
  "votos": [
    {
      "numero_partido": "93",
      "fk_idcandidato": 123,
      "qtd_votos": 1,
      "fk_idlocal_votacao": 1
    }
  ],
  "unmatched": ["9301:1 (partido 93)"],
  "localVotacaoId": 1
}
```

### Campos Match DDL:
- `boletim.idca` → `boletins.idca` (unique)
- `votos[].numero_partido` → `votos.numero_partido`
- `votos[].fk_idcandidato` → `votos.fk_idcandidato` (FK)
- `votos[].qtd_votos` → `votos.qtd_votos`
- `votos[].fk_idlocal_votacao` → `votos.fk_idlocal_votacao` (FK)

## Endpoints

### Test (Debug)
**GET** `/api/qr/test/resolve`
- Hard-coded QR1 + QR2
- Retorna objeto parseado (sem inserir)
- Console.log estruturado

### Production
**POST** `/api/qr`
- Body: `{ qr1: string, qr2: string }`
- Valida duplicata em `boletins.idca`
- Insere boletim + votos em transação
- Notifica webhook se configurado
- Retorna: `{ ok: true, inserted: n, unmatched: [] }`

## Edge Cases Tratados

✅ Múltiplos QR codes em ordem aleatória → ordenação automática  
✅ HASH/ASSI removidos antes de parsing → dados limpos  
✅ Duplicatas → verifica `boletins.idca` UNIQUE  
✅ Candidatos não encontrados → lista `unmatched`, fk_idcandidato = null  
✅ Local não encontrado → erro 400  
✅ Transacionabilidade ACID → rollback em erro  

## Regras de Negócio

| Regra | Implementação |
|-------|---------------|
| Partido implícito | `primaryDigits(numeroCandidato)` se `partidoAtual` vazio |
| Legenda de partido | Trata como voto normal (sem candidato específico) |
| Votos sem candidato | Retorna em `unmatched`; fk_idcandidato = null |
| Duplicidade | Verifica `boletins.idca` antes de inserir |

## Files

- `lib/qr.ts` — Parser com state machine
- `app/api/qr/route.ts` — Endpoint POST production
- `app/api/qr/test/resolve/route.ts` — Endpoint GET debug
- `docs/QR_CODE_READING.md` — Especificação original
