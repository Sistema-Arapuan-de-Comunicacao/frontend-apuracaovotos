"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Html5QrcodeResult, Html5QrcodeScanner } from "html5-qrcode";
import { Html5QrcodeScannerConfig } from "html5-qrcode/esm/html5-qrcode-scanner";
import Image from "next/image";
import { useEffect } from "react";

export default function Page() {

  const qrcodeRegionId = "reader"
  const config: Html5QrcodeScannerConfig = {
    fps: 10,
    qrbox: { width: 250, height: 250 },
  }

  const onSucess = (decodedText: string, decodedResult: Html5QrcodeResult) => {
    console.log("Text: ", decodedText);
    console.log("Result: ", decodedResult);
  }

  const onError = () => { };

  useEffect(() => {
    const html5QrcodeScanner = new Html5QrcodeScanner(
      qrcodeRegionId,
      config,
      false
    )

    html5QrcodeScanner.render(onSucess, onError);

    

    return () => {
      html5QrcodeScanner.clear().catch((error) => {
        console.error("Failed to clear html5QrcodeScanner. ", error)
      })
    }
  }, []);

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
          <CardDescription>Utilize a câmera do celular para ler as informaçẽos do Qrcode</CardDescription>
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
                <div id={qrcodeRegionId} />
              </Field>
            </FieldGroup>
            <Button className="w-full">Entrar</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
