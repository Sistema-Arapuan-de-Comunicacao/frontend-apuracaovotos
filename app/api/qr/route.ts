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
        { error: "IDCA/IDUE not found in QR texts" },
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
          // Extrai o código do cargo atual do QR (ex: "1" para Presidente, "3" para Governador)
          const codigoCargo = String(cargo.codigoCargo ?? cargo.cargo ?? cargo.codigo)

          for (const voto of cargo.votos) {
            // Valida o número do candidato E o cargo ao qual ele pertence
            const candidato = await tx.candidatos
              .findFirst({
                where: {
                  numero_candidato: voto.numeroCandidato,
                  cargos: {
                    codigo_cargo: codigoCargo,
                  },
                },
              })
              .catch(() => null)

            if (!candidato) {
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
    //     // ignore webhook errors
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