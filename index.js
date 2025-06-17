import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Server } from "socket.io";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

// Open the database file
const db = await open({
  filename: "chat.db",
  driver: sqlite3.Database,
});

// Create 'messages' table if it doesn't exist
// include the client_offset with the message
// NOTE: offset (偏移量: 準確反映了這個值在訊息流中的「位置偏移」概念) 是一個訊息的唯一識別符，用來追蹤訊息的順序和確保訊息不會重複或遺失。
await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_offset TEXT UNIQUE,
      content TEXT
    )
  `);

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

app.get("/", (_req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

io.on("connection", async (socket) => {
  socket.emit("system:announcement", "Welcome to the chat!");

  socket.emit(
    "system:announcement",
    `*Connected (recovered: ${socket.recovered})`
  );

  socket.on("chat:message", async (msg, clientOffset, callback) => {
    let result;

    try {
      // store the message in the database
      // content: 指定要插入資料的欄位名稱
      // ?: 是一個參數化查詢的佔位符 (parameter placeholder)，實際的值會由後面的 msg 參數提供
      result = await db.run(
        "INSERT INTO messages (content, client_offset) VALUES (?, ?)",
        msg,
        clientOffset
      );
    } catch (error) {
      // 資料庫中的 client_offset 欄位被設定為 UNIQUE，這意味著每個 client_offset 值只能出現一次。
      // 網路不穩定時：訊息可能因為網路問題被重複發送

      console.log("error: ", error);
      // error:  [Error: SQLITE_CONSTRAINT: UNIQUE constraint failed: messages.client_offset] {
      //   errno: 19,
      //   code: 'SQLITE_CONSTRAINT' (錯誤類型：約束違反)
      // }

      //錯誤解析
      // SQLITE_CONSTRAINT：SQLite 資料庫約束違反錯誤
      // UNIQUE constraint failed：唯一性約束失敗
      // messages.client_offset：在 messages 表格的 client_offset 欄位上發生錯誤

      // 防重複訊息機制
      if (error.errno === 19) {
        // 告訴客戶端訊息已被處理，即使是重複訊息也要確認通知
        // 如果沒有 callback
        // 結果：
        // 1. 客戶端會重試 3 次
        // 2. 10 秒後觸發 ackTimeout
        // 3. 使用者不知道訊息狀態
        // 4. 可能產生多個錯誤日誌
        callback();
      } else {
        // nothing to do, just let the client retry
      }

      return;
    }

    // console.log("result: ", result);
    // result:  { stmt: Statement { stmt: undefined }, lastID: 2, changes: 1 }
    // lastID: 2 表示剛剛插入的訊息的 ID 是 2
    // changes: 1 表示剛剛插入了一筆資料

    // Send the message to everyone, including the sender for demo purposes
    // Include the offset with the message
    io.emit("chat:message", msg, result.lastID);

    // Do not forget to acknowledge the event, or else the client will keep retrying (up to retries times).
    // 告訴客戶端，訊息已經被成功送達
    // 基本確認
    callback();

    // 也可以傳遞成功狀態
    // callback({ success: true, messageId: result.lastID });

    // 也可以傳遞錯誤資訊
    // callback({ success: false, error: "Duplicate message" });

    // 這一行簡單的 callback() 背後...
    // 實際上 Socket.IO 做了：
    // 1. 生成一個回應封包
    // 2. 將回應標記為對應的原始訊息 ID
    // 3. 透過 WebSocket/HTTP 長輪詢發送回應
    // 4. 客戶端收到後停止重試機制
    // 5. 觸發客戶端的 acknowledgment 處理
  });

  // NOTE
  // !socket.recovered: 表示 Socket.IO 的自動恢復機制失敗，需要手動補發錯過的訊息
  // 客戶端已連線，但連線狀態無法恢復，所以需要手動補發錯過的訊息

  // 客戶端重新連線 → 觸發 connection 事件
  // Socket.IO 檢查 → 能否恢復之前的連線狀態？
  // ✅ 能恢復 → socket.recovered = true → Socket.IO 自動重發錯過的訊息
  // ❌ 無法恢復 → socket.recovered = false → 執行這段程式碼手動補發
  if (!socket.recovered) {
    try {
      // db.each 會逐筆處理查詢結果，不會一次載入所有資料到記憶體
      // 適合處理大量訊息的情況

      await db.each(
        // 查詢資料庫中 id 大於 socket.handshake.auth.serverOffset 的資料
        // socket.handshake.auth.serverOffset || 0 - 客戶端最後收到的訊息 ID，如果沒有就從 0 開始
        // 伺服器端讀取客戶端傳來的 serverOffset
        "SELECT id, content FROM messages WHERE id > ?",
        [socket.handshake.auth.serverOffset || 0],
        (_err, row) => {
          console.log("row: ", row);
          // row:  { id: 6, content: 'are you there' }

          // 發送訊息給客戶端
          // 客戶端會收到訊息，並更新最後收到的訊息 ID
          // 下次連線時，會從這個 ID 開始接收訊息
          socket.emit("chat:message", row.content, row.id);
        }
      );
    } catch (error) {
      console.error("Error fetching messages: ", error);
    }
  }

  socket.on("disconnect", (reason) => {
    console.log("user disconnected: ", reason);

    socket.broadcast.emit(
      "system:announcement",
      `${socket.id} have been disconnected`
    );
  });
});

server.listen(3000, () => {
  console.log("Server is running on port 3000");
});

// NOTE: 測試斷線重連

// 使用瀏覽器開發者工具模擬離線
// 1. 開啟 DevTools → Network 分頁
// 2. 勾選 "Offline" 模擬斷網
// 3. 等幾秒後取消勾選
// 4. 觀察是否顯示 recovered: true
