"use client"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  CircleStop,
  LoaderCircle,
  Trash2,
  Undo2,
} from "lucide-react"
import { Html5Qrcode, type Html5QrcodeCameraScanConfig } from "html5-qrcode"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"

const QR_CODE_READER_ID = "reader"

const QR_CODE_CONFIG: Html5QrcodeCameraScanConfig = {
  fps: 5,
  qrbox: { width: 250, height: 250 },
}

type QrCodeValues = [string, string]
type Feedback = {
  type: "info" | "success" | "error"
  message: string
}

const INITIAL_QR_CODE_VALUES: QrCodeValues = ["", ""]

export default function Page() {
  const [qrCodeValue, setQrCodeValue] = useState<QrCodeValues>(
    INITIAL_QR_CODE_VALUES
  )
  const [lastIndex, setLastIndex] = useState<0 | 1 | null>(null)
  const [isReading, setIsReading] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>({
    type: "info",
    message: "Inicie a câmera e leia os dois QR Codes.",
  })

  const qrCodeScanner = useRef<Html5Qrcode | null>(null)
  const qrCodeValueRef = useRef<QrCodeValues>(INITIAL_QR_CODE_VALUES)

  const completedReadings = qrCodeValue.filter(Boolean).length
  const isComplete = completedReadings === 2
  const textareaValue = qrCodeValue.filter(Boolean).join("\n\n")

  const updateQrCodeValue = (value: QrCodeValues) => {
    qrCodeValueRef.current = value
    setQrCodeValue(value)
  }

  const stopReading = async (keepFeedback = false) => {
    const scanner = qrCodeScanner.current

    if (!scanner?.isScanning) {
      setIsReading(false)
      return
    }

    try {
      await scanner.stop()
      setIsReading(false)

      if (!keepFeedback) {
        setFeedback({
          type: "info",
          message: "Leitura finalizada. Você pode iniciá-la novamente.",
        })
      }
    } catch {
      setFeedback({
        type: "error",
        message: "Não foi possível finalizar a câmera. Tente novamente.",
      })
    }
  }

  const onSuccess = (decodedText: string) => {
    const qrCodePart = Number(decodedText[5]);

    if (!decodedText.startsWith("QRBU") || ![1, 2].includes(qrCodePart)) {
      setFeedback({
        type: "error",
        message: "Este QR Code não é válido para esta apuração.",
      })
      return
    }

    const index = (qrCodePart - 1) as 0 | 1
    const currentValues = qrCodeValueRef.current

    if (currentValues[index] === decodedText) return

    const newQrCodeValue: QrCodeValues = [...currentValues]
    newQrCodeValue[index] = decodedText
    updateQrCodeValue(newQrCodeValue)
    setLastIndex(index)

    if (newQrCodeValue.every(Boolean)) {
      setFeedback({
        type: "success",
        message: "Leitura concluída! Os dois QR Codes foram confirmados.",
      })
      void stopReading(true)
      return
    }

    setFeedback({
      type: "success",
      message: `QR Code ${qrCodePart} confirmado. Agora leia o outro código.`,
    })
  }

  const startReading = async () => {
    const scanner = qrCodeScanner.current

    if (!scanner || scanner.isScanning || isStarting) return

    setIsStarting(true)
    setFeedback({
      type: "info",
      message: "Abrindo a câmera…",
    })

    try {
      await scanner.start(
        { facingMode: "environment" },
        QR_CODE_CONFIG,
        onSuccess,
        () => undefined
      )
      setIsReading(true)
      setFeedback({
        type: "info",
        message: "Câmera ativa. Posicione um QR Code dentro do quadro.",
      })
    } catch {
      setFeedback({
        type: "error",
        message:
          "Não foi possível acessar a câmera. Verifique a permissão do navegador.",
      })
    } finally {
      setIsStarting(false)
    }
  }

  const removeLastIndex = () => {
    if (lastIndex === null) return

    const newQrCodeValue: QrCodeValues = [...qrCodeValueRef.current]
    newQrCodeValue[lastIndex] = ""
    updateQrCodeValue(newQrCodeValue)
    setLastIndex(null)
    setFeedback({
      type: "info",
      message: "A última leitura foi removida.",
    })
  }

  const clearQrCodeValue = () => {
    updateQrCodeValue(["", ""])
    setLastIndex(null)
    setFeedback({
      type: "info",
      message: "As leituras foram apagadas.",
    })
  }

  useEffect(() => {
    const scanner = new Html5Qrcode(QR_CODE_READER_ID)
    qrCodeScanner.current = scanner

    return () => {
      qrCodeScanner.current = null

      if (scanner.isScanning) {
        void scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => undefined)
      } else {
        scanner.clear()
      }
    }
  }, [])

  return (
    <main className="flex min-h-dvh w-full items-start justify-center bg-muted/40 px-3 py-4 sm:items-center">
      <Card className="relative w-full max-w-md shadow-sm">
        <div
          className="absolute top-4 right-4 flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums"
          aria-label={`${completedReadings} de 2 QR Codes lidos`}
        >
          <span
            className={`size-1.5 rounded-full ${completedReadings >= 1 ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
          />
          <span
            className={`size-1.5 rounded-full ${completedReadings === 2 ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
          />
          {completedReadings}/2
        </div>

        <CardHeader className="px-5 pt-4 text-center">
          <Image
            className="mx-auto mb-2 h-auto w-32"
            src="/eleicoes-2026.webp"
            width={170}
            height={140}
            alt="Eleições 2026"
          />
          <CardTitle className="text-xl">Leia os QR Codes</CardTitle>
          <CardDescription>
            Use a câmera do celular para ler as duas partes do boletim.
          </CardDescription>
        </CardHeader>

        <CardContent className="px-5 pb-1">
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => event.preventDefault()}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="voting-place">Local de votação</FieldLabel>
                <Input
                  id="voting-place"
                  type="text"
                  placeholder="Ex.: exemplo.arapuan"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </Field>

              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel>Câmera</FieldLabel>
                  <span className="text-xs text-muted-foreground">
                    {isReading ? "Lendo…" : "Desativada"}
                  </span>
                </div>

                <div className="overflow-hidden rounded-xl bg-black/5 ring-1 ring-foreground/10">
                  <div id={QR_CODE_READER_ID} className="w-full" />
                </div>

                <div className="flex items-center justify-center gap-4 pt-1">
                  <Button
                    type="button"
                    size="icon-lg"
                    className="size-12 rounded-full"
                    onClick={startReading}
                    disabled={isReading || isStarting}
                    aria-label="Iniciar leitura"
                    title="Iniciar leitura"
                  >
                    {isStarting ? (
                      <LoaderCircle className="size-5 animate-spin" />
                    ) : (
                      <Camera className="size-5" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    className="size-12 rounded-full"
                    onClick={() => void stopReading()}
                    disabled={!isReading}
                    aria-label="Finalizar leitura"
                    title="Finalizar leitura"
                  >
                    <CircleStop className="size-5" />
                  </Button>
                </div>
              </Field>

              <div
                className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${
                  feedback.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : feedback.type === "error"
                      ? "border-destructive/20 bg-destructive/5 text-destructive"
                      : "border-border bg-muted/50 text-muted-foreground"
                }`}
                role="status"
                aria-live="polite"
              >
                {feedback.type === "success" ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                )}
                <span>{feedback.message}</span>
              </div>

              <Field>
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel htmlFor="qr-code-text">
                    Texto dos QR Codes
                  </FieldLabel>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={removeLastIndex}
                      disabled={lastIndex === null}
                      aria-label="Remover a última leitura"
                      title="Remover a última leitura"
                    >
                      <Undo2 />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      onClick={clearQrCodeValue}
                      disabled={completedReadings === 0}
                      aria-label="Apagar todas as leituras"
                      title="Apagar todas as leituras"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <Textarea
                  id="qr-code-text"
                  className="min-h-24 resize-none font-mono text-xs"
                  value={textareaValue}
                  placeholder="Os textos lidos aparecerão aqui."
                  readOnly
                />
              </Field>
            </FieldGroup>

            <Button
              type="submit"
              size="lg"
              disabled={!isComplete}
              onClick={async () => {
                if (!isComplete) return

                setFeedback({ type: "info", message: "Enviando apuração…" })

                try {
                  const res = await fetch("/api/qr", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ qr1: qrCodeValue[0], qr2: qrCodeValue[1] }),
                  })

                  if (res.status === 409) {
                    const data = await res.json()
                    setFeedback({ type: "error", message: data.message || "Boletim já lido." })
                    return
                  }

                  const data = await res.json()
                  if (!res.ok) {
                    setFeedback({ type: "error", message: data.error || "Erro ao enviar." })
                    return
                  }

                  setFeedback({ type: "success", message: `Enviado: ${data.inserted} votos registrados.` })
                  clearQrCodeValue()
                } catch (e) {
                  setFeedback({ type: "error", message: "Erro de rede ao enviar." })
                }
              }}
            >
              {isComplete
                ? "Enviar apuração"
                : `Leia ${2 - completedReadings} QR Code${
                    completedReadings === 1 ? "" : "s"
                  }`}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
