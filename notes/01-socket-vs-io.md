# `io` 和 `socket` 的區別

## 目錄

- [`io` 和 `socket` 的使用場景](#io-和-socket-的使用場景)
  - [io 物件](#io-物件)
  - [socket 物件](#socket-物件)
- [常見使用場景](#常見使用場景)
- [broadcast.emit() 與 io.emit() 的差別](#broadcastemit-與-ioemit-的差別)
  - [實際例子](#實際例子)
- [簡單記憶法](#簡單記憶法)

## `io` 和 `socket` 的使用場景

在 Socket.IO 中，`io` 和 `socket` 代表不同的物件和操作範圍：

### io 物件

- 代表整個 Socket.IO 伺服器實例
- 控制所有連線
- 用於廣播訊息給所有已連線的用戶
- 例如 `io.emit("事件名稱", 資料)` 會將訊息發送給所有連線的客戶端

### socket 物件

- 代表單一客戶端的連線
- 只控制特定一個連線
- 用於與特定用戶互動
- 例如 `socket.emit("事件名稱", 資料)` 只會發送訊息給該特定客戶端

## 常見使用場景

```javascript
io.on("connection", (socket) => {
  // 這裡的 socket 是特定用戶的連線

  socket.on("chat message", (msg) => {
    // 處理特定用戶發送的訊息

    // 使用 io.emit 將訊息廣播給所有人
    io.emit("chat message", msg);
  });
});
```

- `socket.emit()` - 只發送給發送者
- `socket.broadcast.emit()` - 發送給除了發送者外的所有人
- `io.emit()` - 發送給所有連線的用戶

## broadcast.emit() 與 io.emit() 的差別

雖然 `socket` 代表單一連線，但 Socket.IO 提供了 `socket.broadcast` 屬性來實現廣播功能：

- `socket.broadcast.emit("事件", 資料)` - 發送給除了「該 socket 連線」以外的所有連線
- `io.emit("事件", 資料)` - 發送給所有連線，包括發送者

### 實際例子

```javascript
io.on("connection", (socket) => {
  // 當使用者加入聊天室
  socket.broadcast.emit("user joined", "某人加入了聊天室"); // 告訴其他人，但不告訴自己

  socket.on("chat message", (msg) => {
    // 方法 1: 讓所有人看到訊息，包括發送者
    io.emit("chat message", msg);

    // 方法 2: 只讓其他人看到訊息，發送者不會收到
    // socket.broadcast.emit("chat message", msg);

    // 方法 3: 只讓發送者看到訊息
    // socket.emit("chat message", msg);
  });
});
```

## 簡單記憶法

- `io` 處理全域操作
- `socket` 處理個別連線操作
- `socket.broadcast` 是特殊功能，讓單一連線能夠與「除了自己以外的其他所有連線」通訊
