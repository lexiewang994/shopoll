import prisma from "../db.server";

export const loader = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ready", database: "connected" });
  } catch {
    return Response.json(
      { status: "unavailable", database: "disconnected" },
      { status: 503 },
    );
  }
};
