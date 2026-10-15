const http = require("node:http");

const port = Number(process.env.PORT || 8310);

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    const body = JSON.stringify({ ok: true, service: "pc-power-cloud", status: "bootstrap" });
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(body);
    return;
  }

  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("PC Power Cloud bootstrap is running.\n");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`pc-power-cloud listening on ${port}`);
});
