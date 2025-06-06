import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Server } from "socket.io";

const app = express();
const server = createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {},
});

const __dirname = dirname(fileURLToPath(import.meta.url));

// console.log("import.meta.url: ", import.meta.url);
// file:///Users/pamcy/Coding/Small-Step/socket-chat-playground/index.js

// console.log("__dirname: ", __dirname);
// /Users/pamcy/Coding/Small-Step/socket-chat-playground

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

io.on("connection", (socket) => {
  console.log("a user connected, recovered: ", socket.recovered);

  socket.on("chat message", (msg) => {
    // send the message to everyone, including the sender for demo purposes
    console.log("broadcast message: ", msg);
    io.emit("chat message", msg);
  });

  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
});

server.listen(3000, () => {
  console.log("Server is running on port 3000");
});
