const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {

    if (req.url === "/") {

        const file = fs.readFileSync(
            path.join(__dirname, "client/index.html")
        );

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(file);

    }
    else if (req.url === "/app.js") {

        const file = fs.readFileSync(
            path.join(__dirname, "client/app.js")
        );

        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(file);

    }

});

const wss = new WebSocket.Server({ server });

let clients = [];

wss.on("connection", ws => {

    clients.push(ws);

    ws.on("message", msg => {

        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(msg.toString());
            }
        });

    });

    ws.on("close", () => {
        clients = clients.filter(c => c !== ws);
    });

});

server.listen(PORT, () => {
    console.log("Server running on port", PORT);
});