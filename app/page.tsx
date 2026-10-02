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
import { Html5Qrcode, Html5QrcodeResult } from "html5-qrcode"
import { Html5QrcodeCameraScanConfig } from "html5-qrcode/esm/html5-qrcode"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"

export default function Page() {
  const [qrCodeValue, setQrCodeValue] = useState<string>('');
  
  const qrCodeScanner = useRef<Html5Qrcode | null>(null)
  const qrcodeConfig: { id: string; configs: Html5QrcodeCameraScanConfig } = {
    id: "reader",
    configs: {
      fps: 10,
      qrbox: { width: 250, height: 250 },
    },
  }

  const onSucess = (decodedText: string, decodedResult: Html5QrcodeResult) => {
    console.log("Text: ", decodedText);
    console.log("Result: ", decodedResult);
    setQrCodeValue(decodedText);
    
    if (decodedText) {
      stopReading();
    }
  }

  const stopReading = () => {
    qrCodeScanner.current?.stop()
  }

  const startReading = () => {
    qrCodeScanner.current?.start(
      { facingMode: "environment" },
      qrcodeConfig.configs,
      onSucess,
      (error) => console.log("Error: ", error)
    )
  }

  useEffect(() => {
    const html5Qrcode = new Html5Qrcode(qrcodeConfig.id);

    qrCodeScanner.current = html5Qrcode;

    return () => {
      if (html5Qrcode.isScanning) {
        html5Qrcode.stop().then(() => html5Qrcode.clear());
      }
    }
  }, [])

  return (
    <main className="flex h-screen w-full items-center justify-center">
      <Card className="w-[90%]">
        <CardHeader className="text-center">
          <Image
            className="mx-auto mb-3"
            src="/eleicoes-2026.webp"
            width={170}
            height={140}
            alt=""
          />
          <CardTitle>Leia o Qrcode</CardTitle>
          <CardDescription>
            Utilize a câmera do celular para ler as informaçẽos do Qrcode
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col items-center gap-6">
            <FieldGroup>
              <Field>
                <FieldLabel>Local de votação</FieldLabel>
                <Input type="text" placeholder="exemplo.arapuan" />
              </Field>
              <Field>
                <FieldLabel>Ler Qrcode</FieldLabel>
                <div id={qrcodeConfig.id}/>
                <Button type="button" onClick={startReading}>Ler Qrcode</Button>
                <Button type="button" onClick={stopReading}>Parar</Button>
              </Field>
              <Field>
                <FieldLabel>Texto do QrCode</FieldLabel>
                <Textarea value={qrCodeValue} />
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
