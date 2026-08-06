import prismaClientPackage, {
  type PrismaClient as PrismaClientType,
} from "@prisma/client";

const { PrismaClient } = prismaClientPackage;

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClientType;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;
