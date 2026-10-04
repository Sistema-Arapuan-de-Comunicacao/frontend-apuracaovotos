import { PrismaClient } from "@prisma/client"

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

export const prisma =
  global.prisma ?? (global.prisma = new PrismaClient({ log: ["error"] }))

export default prisma
