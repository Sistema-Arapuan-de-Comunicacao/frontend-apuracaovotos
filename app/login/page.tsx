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
import Image from "next/image"

export default function Login() {
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
          <CardTitle>Login</CardTitle>
          <CardDescription>Informe seu dados para seguir</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col items-center gap-6">
            <FieldGroup>
              <Field>
                <FieldLabel>username</FieldLabel>
                <Input type="text" placeholder="exemplo.arapuan" />
              </Field>
              <Field>
                <FieldLabel>senha</FieldLabel>
                <Input type="password" placeholder="************" />
              </Field>
            </FieldGroup>
            <Button className="w-full">Entrar</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
