import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: { service: "shopoll" },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "headers.authorization",
      "headers.cookie",
      "email",
      "phone",
      "phoneNumber",
      "firstName",
      "lastName",
      "address",
      "accessToken",
      "apiKey",
      "token",
      "inviteToken",
      "encryptedValue",
      "codeEncrypted",
    ],
    censor: "[redacted]",
  },
});
