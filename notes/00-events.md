# Socket.IO 事件系統筆記

## 目錄

- [簡介](#簡介)
- [事件命名](#事件命名)
- [客戶端與伺服器端事件對應關係](#客戶端與伺服器端事件對應關係)
  - [事件傳遞對應表](#事件傳遞對應表)
  - [事件流程示意圖](#事件流程示意圖)
- [事件通訊實例](#事件通訊實例)
  - [聊天室：發送和接收聊天訊息](#聊天室發送和接收聊天訊息)
  - [使用者狀態：通知使用者加入/離開](#使用者狀態通知使用者加入離開)
  - [輸入指示器：顯示誰正在輸入](#輸入指示器顯示誰正在輸入)
- [主要發送模式](#主要發送模式)
  - [1. 點對點發送（伺服器 → 特定客戶端）](#1-點對點發送伺服器--特定客戶端)
  - [2. 廣播（伺服器 → 除發送者外的所有客戶端）](#2-廣播伺服器--除發送者外的所有客戶端)
  - [3. 全體廣播（伺服器 → 所有客戶端）](#3-全體廣播伺服器--所有客戶端)
  - [4. 房間訊息（伺服器 → 特定房間的所有客戶端）](#4-房間訊息伺服器--特定房間的所有客戶端)
- [注意事項](#注意事項)
- [除錯技巧](#除錯技巧)

## 簡介

Socket.IO 是基於「**事件驅動的通訊機制**」，類似於瀏覽器的 DOM 事件（如 click、submit），但用於在客戶端和伺服器端之間雙向通訊。

## 事件命名

在 Socket.IO 中，事件名稱（如 `'chat message'`）可自定義：

- 🔹 可任意取名，無特定規則限制
- 🔹 建議使用有意義的名稱，描述事件用途
- 🔹 常見命名模式：動詞+名詞（如 `'user joined'`、`'message sent'`）
- ⚠️ 避免使用保留事件名稱：`'connect'`、`'disconnect'`、`'error'` 等

## 客戶端與伺服器端事件對應關係

Socket.IO 使用「發布-訂閱」模式，通過相同的事件名稱建立連接：

### 事件傳遞對應表

| 客戶端                          | 伺服器端                                                   | 說明                      |
| ------------------------------- | ---------------------------------------------------------- | ------------------------- |
| `socket.emit('事件名', 資料)`   | `socket.on('事件名', callback)`                            | 客戶端發送 → 伺服器端接收 |
| `socket.on('事件名', callback)` | `socket.emit('事件名', 資料)` 或 `io.emit('事件名', 資料)` | 伺服器端發送 → 客戶端接收 |

### 事件流程示意圖

```
[客戶端] socket.emit('chat message', '你好')  →→→→→  [伺服器端] socket.on('chat message', callback)
                                                     ⬇️ 處理資料
[客戶端] socket.on('chat message', callback)  ←←←←←  [伺服器端] io.emit('chat message', '你好')
```

## 事件通訊實例

### 聊天室：發送和接收聊天訊息

**客戶端：**

```javascript
// 建立連接
const socket = io();

// 發送聊天訊息到伺服器
form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (input.value) {
    socket.emit("chat message", input.value);
    input.value = "";
  }
});

// 接收伺服器廣播的訊息
socket.on("chat message", (msg) => {
  const item = document.createElement("li");
  item.textContent = msg;
  messages.appendChild(item);
});
```

**伺服器端：**

```javascript
io.on("connection", (socket) => {
  // 接收客戶端發送的聊天訊息
  socket.on("chat message", (msg) => {
    console.log("收到訊息: ", msg);

    // 將訊息廣播給所有客戶端
    io.emit("chat message", msg);
  });
});
```

### 使用者狀態：通知使用者加入/離開

**客戶端：**

```javascript
// 顯示他人加入通知
socket.on("user joined", (username) => {
  addNotification(`${username} 加入了聊天室`);
});

// 顯示他人離開通知
socket.on("user left", (username) => {
  addNotification(`${username} 離開了聊天室`);
});
```

**伺服器端：**

```javascript
io.on("connection", (socket) => {
  // 用戶加入時，可能會先提供名稱
  socket.on("set username", (username) => {
    socket.username = username;

    // 通知其他人有新用戶加入（除了自己）
    socket.broadcast.emit("user joined", username);
  });

  // 用戶斷開連接
  socket.on("disconnect", () => {
    if (socket.username) {
      // 通知所有人有用戶離開
      io.emit("user left", socket.username);
    }
  });
});
```

### 輸入指示器：顯示誰正在輸入

**客戶端：**

```javascript
// 發送正在輸入狀態
input.addEventListener("input", () => {
  socket.emit("typing", true);
});

input.addEventListener("blur", () => {
  socket.emit("typing", false);
});

// 顯示誰正在輸入
socket.on("typing status", (data) => {
  updateTypingStatus(data.username, data.isTyping);
});
```

**伺服器端：**

```javascript
io.on("connection", (socket) => {
  socket.on("typing", (isTyping) => {
    // 通知其他人此用戶的輸入狀態（除了自己）
    socket.broadcast.emit("typing status", {
      username: socket.username,
      isTyping: isTyping,
    });
  });
});
```

## 主要發送模式

### 1. 點對點發送（伺服器 → 特定客戶端）

**伺服器端：**

```javascript
// 僅發送給這個特定客戶端
socket.emit("private message", {
  content: "這是只給你的訊息",
});
```

**客戶端：**

```javascript
// 接收私人訊息
socket.on("private message", (data) => {
  showPrivateMessage(data.content);
});
```

### 2. 廣播（伺服器 → 除發送者外的所有客戶端）

**伺服器端：**

```javascript
// 發送給除了這個客戶端以外的所有連接
socket.broadcast.emit("announcement", "有新用戶加入");
```

**客戶端：**

```javascript
// 接收公告
socket.on("announcement", (message) => {
  showAnnouncement(message);
});
```

### 3. 全體廣播（伺服器 → 所有客戶端）

**伺服器端：**

```javascript
// 發送給所有連接的客戶端
io.emit("global message", "系統維護通知");
```

**客戶端：**

```javascript
// 接收全體訊息
socket.on("global message", (message) => {
  showGlobalMessage(message);
});
```

### 4. 房間訊息（伺服器 → 特定房間的所有客戶端）

**客戶端：**

```javascript
// 請求加入特定房間
socket.emit("join room", "JavaScript討論區");

// 接收房間訊息
socket.on("room message", (data) => {
  addMessageToRoom(data.room, data.message);
});
```

**伺服器端：**

```javascript
io.on("connection", (socket) => {
  // 處理加入房間請求
  socket.on("join room", (room) => {
    socket.join(room);

    // 可選：通知房間有用戶加入
    io.to(room).emit("room message", {
      room: room,
      message: `新用戶加入了 ${room}`,
    });
  });

  // 發送訊息到特定房間
  socket.on("send to room", (data) => {
    io.to(data.room).emit("room message", {
      room: data.room,
      message: data.message,
    });
  });
});
```

## 注意事項

- ⚠️ 事件名稱區分大小寫
- ⚠️ 資料可以是任何可序列化的值（字串、數字、物件、陣列等）
- ⚠️ 在框架中使用時，記得卸載時清理事件監聽（避免記憶體洩漏）
- 💡 監聽 `connect_error` 事件來處理連接錯誤
- 💡 使用命名空間和房間組織複雜應用的通訊

## 除錯技巧

啟用 Socket.IO 的除錯模式，在瀏覽器控制台查看詳細日誌：

```javascript
// 在連接前設置
localStorage.debug = "*";
const socket = io();
```
