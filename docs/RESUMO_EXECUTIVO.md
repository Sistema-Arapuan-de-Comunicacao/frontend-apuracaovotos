# Resumo Executivo - Implementação de QR CODE Processing

**Data:** 3 de outubro de 2026  
**Projeto:** Apuração de Votos - Sistema de Leitura QR Code  
**Status:** Análise + Desenvolvimento Parcial Complete | Pronto para Testes Integrados

---

## 1. Contexto e Objetivos

### Problema
Sistema web (Next.js) para leitura de QR codes de Boletim de Urna (BU) em tempo real, onde motoboys capturam dados dos boletins impressos e enviam para análise centralizada.

### Solução Adotada
- Frontend: Captura QR com câmera do celular (HTML5-QRCode) → 2 partes de BU
- Backend: Parse state machine + resolução de FKs + transação DB
- Database: PostgreSQL 18 com Prisma ORM

### Stakeholders Envolvidos
- Motoboys (captura em campo)
- Dashboard de apuração (consome dados via webhook/DB direto)
- Banco centralizado (fonte única da verdade)

---

## 2. Decisões Arquiteturais Críticas

### 2.1 Estrutura de Dados do QR
| Decisão | Racional |
|---------|----------|
| **Múltiplos QR codes sequenciais** | Limite de 1.100 chars/QR → BUs grandes precisam 2-9 partes |
| **QRBU:i:n no início** | Identifica índice e total esperado automaticamente |
| **HASH/ASSI removidos** | Dados de auditoria/segurança; saída final sem redundância |
| **State machine para parsing** | Contexto dinâmico (municipio, zona, cargo, partido) necessário |

### 2.2 Resolução de Chaves Estrangeiras
| Decisão | Racional |
|---------|----------|
| **Lookup local_votacao por codigo_local primeiro** | Mais específico e rápido |
| **Fallback para municipio + zona** | Se local não existir isolado |
| **candidatos por numero_candidatoOU numero_partido** | Flexibilidade: alguns votos vêm por código, outros por partido |
| **Null permitido em fk_idcandidato** | Se candidato não existir, registra mesmo assim com flag |

### 2.3 Duplicidade e Transacionalidade
| Decisão | Racional |
|---------|----------|
| **IDCA (código de carga) como chave única** | Hash estável do TSE; evita duplicatas mesmo se reenviado |
| **Transação ACID completa** | Tudo-ou-nada: se falhar inserção de 1 voto, rollback tudo |
| **Webhook assíncrono (fire-and-forget)** | Notificação pós-inserção não bloqueia resposta |

### 2.4 ORM e Migrations
| Decisão | Racional |
|---------|----------|
| **Prisma @5.10.0+** | Type-safe; migrations declarativas; suporte transações |
| **numero_partido Optional (String?)** | Evita reset DB; permite dados legados incompletos |
| **Tabela boletins interna** | Rastreia processamento; chave única em idca |

---

## 3. Funções Criadas

### 3.1 `lib/qr.ts` — Core Parser

#### Interfaces Exportadas
```typescript
ParsedVoto {
  numeroCandidato: string
  numeroPartido: string
  qtdVotos: number
}

ParsedCargo {
  codigoCargo: string
  votos: ParsedVoto[]
}

ParsedBoletim {
  idca: string
  idue: string
  municipio: string
  zona: number
  local: string
  cargos: ParsedCargo[]
}
```

#### Funções Internas (Step-by-Step)

1. **`extractQrMetadata(qrText: string)`**
   - Regex: `/QRBU:(\d+):(\d+)/`
   - Retorna: `{ indice, total }` ou `null`
   - Uso: Validar estrutura de cada QR

2. **`orderAndValidate(qrTexts: string[])`**
   - Extrai metadados de cada texto
   - Ordena por `indice` ascendente
   - Valida continuidade 1→n e quantidade
   - Retorna: `QrPart[]` ordenado
   - Erros: "Invalid QRBU", "Inconsistent counts", "Sequence broken"

3. **`cleanCryptoFields(text: string, isLastPart: boolean)`**
   - Remove `HASH:[A-F0-9]+` de todas
   - Remove `ASSI:[A-F0-9]+` apenas se `isLastPart=true`
   - Retorna: string limpa
   - Preserva espaços para tokenização

4. **`concatenateAndTokenize(parts: QrPart[])`**
   - Junta partes limpas com espaço
   - Split por `/\s+/` (espaço em branco)
   - Filtra vazios
   - Retorna: `string[]` de tokens

5. **`parseTokens(tokens: string[])`**
   - **State machine core**
   - Mantém: `contextoLocalizacao`, `cargoAtual`, `partidoAtual`
   - Itera tokens:
     - `MUNI:`, `ZONA:`, `LOCA:` → atualiza localização
     - `IDCA:`, `IDUE:` → atualiza identificador
     - `CARG:` → novo cargo (reseta partido)
     - `PART:` → novo partido
     - `\d+:\d+` → novo voto (numeroCandidato:qtdVotos)
   - Regra: Se partdoAtual vazio, extrai `numero.slice(0,2)` como partido
   - Retorna: `ParsedBoletim` estruturado

6. **`parseQrTexts(qr1, qr2)` — Orquestrador Público**
   ```
   qrTexts → orderAndValidate → tokenize → parseTokens → ParsedBoletim
   ```
   - Entry point único
   - Encadeia todas as etapas
   - Lança erros de validação

---

### 3.2 `app/api/qr/route.ts` — Endpoint POST Production

**Fluxo:**
1. Recebe `{ qr1: string, qr2: string }`
2. Parse com `parseQrTexts()`
3. Verifica duplicata: `boletins.findUnique({ where: { idca } })`
   - Se existe → `409 { alreadyRead: true }`
4. Resolve `local_votacao` por código ou municipio+zona
5. Iteração por cargo/voto:
   - Busca `candidatos` por numero_candidato/numero_partido
   - Se encontra → resolve `fk_idcandidato`
   - Se não → lista em `unmatched`
6. **Transação ACID:**
   ```
   BEGIN
     INSERT boletins (idca, raw)
     FOR EACH voto:
       INSERT votos (numero_partido, fk_idcandidato, qtd_votos, fk_idlocal_votacao)
   COMMIT (ou ROLLBACK se erro)
   ```
7. Notifica webhook assíncrono (fire-and-forget)
8. Retorna: `{ ok: true, inserted: n, unmatched: [] }` ou erro

**Tratamento de Erros:**
- `400`: IDCA não encontrado | Local não encontrado
- `409`: Boletim já processado (duplicata)
- `500`: Erro DB ou parsing

---

### 3.3 `app/api/qr/test/resolve/route.ts` — Endpoint GET Debug

**Propósito:** Inspeção estruturada sem inserir no DB

**Fluxo:**
1. Hard-coded QR1 + QR2 (exemplo do manual)
2. Parse idêntico a `/api/qr`
3. Resolve FKs com queries Prisma
4. **Console.log estruturado:**
   ```
   console.log("===== BOLETIM PROCESSADO =====")
   console.log(JSON.stringify(result, null, 2))
   ```
5. Retorna JSON: `{ boletim, votos, unmatched, localVotacaoId }`

**Uso:** `curl http://localhost:3000/api/qr/test/resolve`

---

### 3.4 `lib/prisma.ts` — Singleton Client

```typescript
Instância global (dev-safe com `global.prisma`)
Evita múltiplas conexões em hot-reload
Log: ["error"] apenas
```

---

### 3.5 `prisma/schema.prisma` — Modelo Atualizado

**Tabelas Existentes (pré-populadas):**
- `cargos` (codigo_cargo, nome_cargo)
- `municipios` (codigo_municipio, nome_municipio)
- `local_votacao` (zona, fk_id_municipio, codigo_local, local_votacao)
- `candidatos` (**numero_candidato adicionado**, numero_partido, nome_candidato, nome_urna_candidato, fk_idcargo)
- `votos` (numero_partido, fk_idcandidato, qtd_votos, fk_idlocal_votacao)

**Nova Tabela:**
- `boletins` (idca UNIQUE, raw, createdAt) — rastreia leitura

**Mudança Crítica:**
- `candidatos.numero_partido` → `String?` (Optional)
  - Razão: Dados legados podem estar incompletos; evita reset DB

---

## 4. Mudanças no Frontend

### 4.1 `app/page.tsx`

**Antes:** Botão "Enviar" desabilitado; sem ação

**Depois:**
```typescript
onClick={async () => {
  if (!isComplete) return
  setFeedback({ type: "info", message: "Enviando apuração…" })
  
  try {
    const res = await fetch("/api/qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qr1: qrCodeValue[0], qr2: qrCodeValue[1] })
    })
    
    if (res.status === 409) {
      const data = await res.json()
      setFeedback({ 
        type: "error", 
        message: data.message || "Boletim já lido." 
      })
      return
    }
    
    const data = await res.json()
    if (!res.ok) {
      setFeedback({ 
        type: "error", 
        message: data.error || "Erro ao enviar." 
      })
      return
    }
    
    setFeedback({ 
      type: "success", 
      message: `Enviado: ${data.inserted} votos registrados.` 
    })
    clearQrCodeValue()
  } catch (e) {
    setFeedback({ type: "error", message: "Erro de rede ao enviar." })
  }
}}
```

**Comportamentos:**
- ✅ Duplicata (409) → aviso amigável + sem limpeza
- ✅ Sucesso → conta votos inseridos + limpa campos
- ✅ Erro → mensagem específica
- ✅ Carregamento → feedback "Enviando…"

---

## 5. Configuração e Setup

### 5.1 `.env.local` (Criado)
```env
DATABASE_URL="postgresql://postgres:apuracao@123@localhost:5432/apuracao_votos"
WEBHOOK_URL=""
```

### 5.2 `package.json` (Atualizado)
```json
"@prisma/client": "^5.10.0",
"prisma": "^5.10.0"
```

### 5.3 Prisma Gerado e Sincronizado
```bash
npm install
npx prisma generate
npx prisma db push  # Schema sincronizado (sem reset de dados)
```

### 5.4 Servidor Rodando
```bash
npm run dev
# Listening on http://localhost:3000
```

---

## 6. Testes Realizados

### ✅ Parser State Machine
- Entrada: 2 QR codes de exemplo (QRBU:1:2, QRBU:2:2)
- Saída: `ParsedBoletim` estruturado com 4 cargos × N votos
- Validação: HASH/ASSI removidos, tokens parseados, localizacao resolvida

### ✅ Endpoint /api/qr/test/resolve
- GET sem DB insert
- Console.log estruturado
- Retorna objeto pronto para inserção

### ✅ FK Resolution
- `local_votacao`: Encontrado (municipio 1392, zona 9) → ID 1
- `candidatos`: Nenhum encontrado matcher → unmatched[] preenchido
- Estrutura pronta para INSERT

### ⏳ Pendente: Testes Production
- Inserção real em transactions
- Webhook notification
- Duplicata detection (409)
- Erro handling

---

## 7. Pendências e Próximos Passos

### 7.1 **CRÍTICO - DB Data**
**Status:** Candidatos não estão pré-populados  
**Ação:** 
- [ ] Popular tabela `candidatos` com dados reais (numero_candidato, numero_partido, names, fk_cargo)
- [ ] Validar que números de QR (9301, 9302, 93002, etc.) batem com DB
- [ ] Após isso, fk_idcandidato resolverá automaticamente

**Impacto:** Sem isso, todos os votos terão fk_idcandidato=null (funciona, mas inútil)

### 7.2 **IMPORTANTE - Integração Frontend**
**Status:** Page.tsx enviando, mas sem testes E2E  
**Ação:**
- [ ] Testar fluxo completo: câmera → ler 2 QR → clique "Enviar" → 409/200
- [ ] Validar mensagens feedback (sucesso, duplicata, erro)
- [ ] Testar re-envio de mesmo boletim → confirmação 409

### 7.3 **IMPORTANTE - Webhook**
**Status:** Código pronto (fire-and-forget), mas URL vazia  
**Ação:**
- [ ] Definir `WEBHOOK_URL` em `.env.local` (ex: https://dashboard.local/webhook/qr)
- [ ] Implementar endpoint receptor no dashboard
- [ ] Testar payload: `{ idca, inserted }`

### 7.4 **DESEJÁVEL - Validação de Assinatura**
**Status:** HASH/ASSI removidos (não validados)  
**Ação:**
- [ ] Implementar SHA-512 hash verification (opcional para MVP)
- [ ] EdDSA/ECDSA signature check (complexo, pode diferir para v2)

### 7.5 **DESEJÁVEL - Logging e Auditoria**
**Status:** Nenhum registro de erros de parsing  
**Ação:**
- [ ] Criar tabela `audit_qr` para rastrear tentativas
- [ ] Registrar timestamp, raw QR, status, erro (se houver)
- [ ] Útil para debug em produção

### 7.6 **DESEJÁVEL - Agregação de Votos**
**Status:** Cada voto individual é row  
**Ação:**
- [ ] Considerar agregar por (candidato + local) se muitos duplicados
- [ ] Ou deixar como está (mais granular para auditoria)

### 7.7 **NICE-TO-HAVE - Regras de Legenda**
**Status:** Votos de partido sem candidato inseridos normalmente  
**Ação:**
- [ ] Criar "candidato-fantasma" para legenda (ex: partido 93, nome "Legenda 93")
- [ ] Rastrear votos de legenda separados se necessário

---

## 8. Regras de Negócio Implementadas

| Regra | Implementação | Status |
|-------|---------------|--------|
| QR code sequencial | Extrai QRBU:i:n, ordena, valida continuidade | ✅ |
| Limpeza criptográfica | Remove HASH/ASSI antes de parsing | ✅ |
| State machine parsing | Contexto dinâmico (municipio, zona, cargo, partido) | ✅ |
| Partido implícito | Extrai 2 primeiros dígitos se partidoAtual vazio | ✅ |
| FK resolution | Busca candidatos, local_votacao; permite null | ✅ |
| Duplicidade | Verifica boletins.idca UNIQUE; retorna 409 | ✅ |
| Transacionabilidade | BEGIN/COMMIT/ROLLBACK ACID completo | ✅ |
| Webhook notification | Notificação pós-inserção (async) | ✅ |
| UX feedback | Sucesso, duplicata, erro com mensagens claras | ✅ |

---

## 9. Arquitetura Visual

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend (Next.js)                  │
│  ┌──────────────────────────────────────────────────┐   │
│  │ app/page.tsx (HTML5-QRCode × 2)                 │   │
│  │ ├─ Câmera: QRBU:1:2                             │   │
│  │ └─ Câmera: QRBU:2:2                             │   │
│  │ └─ POST /api/qr { qr1, qr2 }                    │   │
│  └──────────────────────────────────────────────────┘   │
│                           ↓                              │
├─────────────────────────────────────────────────────────┤
│                 Backend (Next.js API)                    │
│  ┌──────────────────────────────────────────────────┐   │
│  │ lib/qr.ts (State Machine Parser)                │   │
│  │ ├─ orderAndValidate() → QrPart[]               │   │
│  │ ├─ cleanCryptoFields() → string                │   │
│  │ ├─ concatenateAndTokenize() → string[]         │   │
│  │ └─ parseTokens() → ParsedBoletim               │   │
│  └──────────────────────────────────────────────────┘   │
│                           ↓                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │ app/api/qr/route.ts (POST)                      │   │
│  │ ├─ Validação: duplicata (boletins.idca)        │   │
│  │ ├─ Resolução: local_votacao, candidatos       │   │
│  │ └─ Transação ACID: INSERT boletims + votos     │   │
│  └──────────────────────────────────────────────────┘   │
│                           ↓                              │
├─────────────────────────────────────────────────────────┤
│              Database (PostgreSQL 18)                    │
│  ├─ boletins (idca UNIQUE, raw)                         │
│  ├─ votos (numero_partido, fk_idcandidato, qtd, ...)   │
│  ├─ candidatos (numero_candidato, numero_partido, ...)  │
│  └─ local_votacao, municipios, cargos                   │
└─────────────────────────────────────────────────────────┘
                           ↓ (async)
                    Webhook Notification
                   (Dashboard Consumer)
```

---

## 10. Checklist de Produção

### Antes do Go-Live
- [ ] DB populado com candidatos reais
- [ ] Webhook URL configurado e testado
- [ ] Testes E2E: câmera + POST + 409 duplicata
- [ ] Logs e auditoria em lugar
- [ ] Backup/restore plan
- [ ] Limits: rate limit em `/api/qr`?
- [ ] Documentation: QR_PROCESSING_SUMMARY.md compartilhado

### Monitoramento Pós-Launch
- [ ] Alertas: QR parsing errors
- [ ] Alertas: DB transaction rollbacks
- [ ] Alertas: unmatched candidates > X%
- [ ] Análise: latência de inserção
- [ ] Análise: taxa de duplicatas

---

## 11. Contatos e Escalação

**Decisões Técnicas:**
- Parse state machine → Coeso no repo
- FK flexibility (null permitido) → Pronto para dados incompletos
- Webhook fire-and-forget → Não bloqueia crítico

**Blockers Atuais:**
- Dados de candidatos necessários urgentemente
- Webhook endpoint receptor (dashboard)

**Riscos Identificados:**
- Candidatos faltantes → Votos órfãos (mas registrados)
- Segurança: HASH/ASSI não validados (future work)
- Escala: Não testado com >10k votos/segundo

---

## Conclusão

✅ **Pronto para:**
- Testes de integração com DB real
- Captura de QR via câmera
- Endpoint POST funcional

⏳ **Bloqueado por:**
- Dados de candidatos no DB
- Configuração de webhook

📊 **Próximo Sprint:**
1. Popular candidatos
2. Testar E2E completo
3. Implementar monitoramento
4. Go-live controlado

---

**Versão:** 1.0  
**Data de Revisão:** 3 de outubro de 2026  
**Status:** Code Complete | Awaiting Data & Testing
