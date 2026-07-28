export const loader = () =>
  Response.json({
    status: "ok",
    service: "shopoll-web",
    version: "1.0.0",
  });
