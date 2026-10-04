import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { parseQrTexts } from "@/lib/qr"

type Body = {
  qr1: string
  qr2: string
}

type MatchedVote = {
  numeroCandidato: string
  numeroPartido: string
  qtdVotos: number
}

export async function POST(request: Request) {
  try {
    const body: Body = await request.json()
    const parsed = parseQrTexts(body.qr1, body.qr2)

    const idca = parsed.idca || null
    if (!idca) {
      return NextResponse.json(
        { error: "IDCA/IDUE não encontrado nos textos do QR" },
        { status: 400 }
      )
    }

    const existing = await prisma.boletins.findUnique({ where: { idca } }).catch(() => null)
    if (existing) {
      return NextResponse.json({ alreadyRead: true, message: "Boletim já processado" }, { status: 409 })
    }

    let localVotacaoId: number | null = null

    if (parsed.local) {
      const lv = await prisma.local_votacao.findFirst({ where: { codigo_local: parsed.local } }).catch(() => null)
      if (lv) localVotacaoId = lv.id
    }

    if (!localVotacaoId && parsed.municipio && parsed.zona) {
      const mun = await prisma.municipios.findFirst({ where: { codigo_municipio: parsed.municipio } }).catch(() => null)
      if (mun) {
        const lv = await prisma.local_votacao.findFirst({
          where: { fk_id_municipio: mun.id, zona: parsed.zona },
        }).catch(() => null)
        if (lv) localVotacaoId = lv.id
      }
    }

    if (!localVotacaoId) {
      return NextResponse.json(
        { error: "Local de votação não encontrado. Cadastre `local_votacao` primeiro." },
        { status: 400 }
      )
    }

    const result: { insertedVotes: any[]; unmatched: MatchedVote[] } = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.boletins.create({
          data: { idca, raw: JSON.stringify(parsed) },
        })

        const insertedVotes: any[] = []
        const unmatched: MatchedVote[] = []

        for (const cargo of parsed.cargos) {
          const cargoStr = cargo.codigoCargo

          // Gera variações ("1", "01", "0001") para garantir correspondência com a BD
          const cargoVariations = Array.from(
            new Set([
              cargoStr,
              cargoStr.padStart(2, "0"),
              cargoStr.padStart(4, "0"),
            ])
          ).filter(Boolean)

          // Padroniza o código cadastrado, preservando os IDs e vínculos dos candidatos.
          await tx.cargos.updateMany({
            where: { codigo_cargo: { in: cargoVariations, not: cargoStr } },
            data: { codigo_cargo: cargoStr },
          })

          for (const voto of cargo.votos) {
            const candidato = await tx.candidatos
              .findFirst({
                where: {
                  numero_candidato: String(voto.numeroCandidato).trim(),
                  cargo: {
                    codigo_cargo: cargoStr,
                  },
                },
              })
              .catch(() => null)

            if (!candidato) {
              console.warn(
                `[Aviso] Candidato não encontrado -> Número: ${voto.numeroCandidato}, Cargo QR: "${cargoStr}", Procurado por variações:`,
                cargoVariations
              )
              unmatched.push({
                numeroCandidato: voto.numeroCandidato,
                numeroPartido: voto.numeroPartido,
                qtdVotos: voto.qtdVotos,
              })
              continue
            }

            const vote = await tx.votos.create({
              data: {
                numero_partido: voto.numeroPartido,
                fk_idcandidato: candidato.id,
                qtd_votos: voto.qtdVotos,
                fk_idlocal_votacao: localVotacaoId,
              },
            })

            insertedVotes.push(vote)
          }
        }

        return { insertedVotes, unmatched }
      }
    )

    // const webhook = process.env.WEBHOOK_URL
    // if (webhook) {
    //   try {
    //     void fetch(webhook, {
    //       method: "POST",
    //       headers: { "Content-Type": "application/json" },
    //       body: JSON.stringify({ idca, inserted: result.insertedVotes.length }),
    //     })
    //   } catch {
    //     // ignora erros de webhook
    //   }
    // }

    return NextResponse.json({
      ok: true,
      inserted: result.insertedVotes.length,
      unmatched: result.unmatched.map(
        (item: MatchedVote) => `${item.numeroCandidato}:${item.qtdVotos} (partido ${item.numeroPartido})`
      ),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
