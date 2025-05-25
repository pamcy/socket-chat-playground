# Socket.IO 通訊模式與事件系統

## 目錄

- [什麼是 Socket.IO？](#什麼是-socketio)
- [Socket.IO 實際運作](#socketio-實際運作)
- [基本概念：io 與 socket](#基本概念io-與-socket)
- [事件系統基礎](#事件系統基礎)
- [四種主要通訊模式](#四種主要通訊模式)
- [實用案例](#實用案例)
- [常見問題與排解](#常見問題與排解)
- [進階功能](#進階功能)

## 什麼是 Socket.IO？

Socket.IO 讓網頁可以進行「**即時雙向通訊**」，類似你和朋友使用通訊軟體聊天。不同於傳統網頁只能「請求-回應」，Socket.IO 讓伺服器可以主動向客戶端發送資料，例如：

- 新訊息通知
- 即時更新狀態
- 線上遊戲互動

🔑 **核心特點**：雙向通訊、即時性、事件驅動

## Socket.IO 實際運作

Socket.IO 的運作模式非常直觀，用聊天室為例：

```
【Socket.IO 基本運作流程】

1️⃣ 用戶發送訊息
[瀏覽器] ---- socket.emit('chat message', '你好') ----> [伺服器]

2️⃣ 伺服器處理並廣播
[伺服器] ---- io.emit('chat message', '你好') ----> [所有瀏覽器]
```

這就是最基本的 Socket.IO 工作流程：客戶端發送事件，伺服器接收處理後，再發送事件給所有或特定的客戶端。

### 簡易代碼示範

```javascript
// 客戶端發送訊息
socket.emit("chat message", "你好！"); // 發送名為 'chat message' 的事件

// 伺服器接收訊息
socket.on("chat message", (msg) => {
  // 監聽名為 'chat message' 的事件
  console.log("收到訊息：" + msg); // 處理接收到的資料
});
```

## 基本概念：io 與 socket

🔌 **簡單理解：**

```
io = 廣播電台 (對所有收音機說話)
socket = 單一收音機 (只對一個人說話)
```

### 三種基本發送方式

| 方法                      | 用途                           | 生活例子                        |
| ------------------------- | ------------------------------ | ------------------------------- |
| `socket.emit()`           | 僅向發送訊息的客戶端發送       | 私訊 (只對一個人說)             |
| `io.emit()`               | 向所有連接的客戶端發送         | 公告 (對所有人說)               |
| `socket.broadcast.emit()` | 向除了發送者外的所有客戶端發送 | 悄悄話 (對除了你以外的所有人說) |

```
【socket.emit】- 私訊 (一對一)
伺服器 ───────────► 特定客戶端 (發送者)
        │
        ╳ ───────► 其他客戶端 (不會收到)
        ╳ ───────► 其他客戶端 (不會收到)

【io.emit】- 公告 (對全部)
        ┌───────► 所有客戶端 (包含發送者)
伺服器  ─┼───────► 所有客戶端
        └───────► 所有客戶端

【socket.broadcast.emit】- 悄悄話 (對除了自己以外的全部)
        ╳ ───────► 特定客戶端 (發送者不會收到)
伺服器  ─┼───────► 其他客戶端
        └───────► 其他客戶端
```

## 事件系統基礎

Socket.IO 使用「**事件名稱**」來區分不同類型的訊息，就像你在不同的聊天群組中交流。

### 事件命名

- 可自由命名，如 `'chat message'`、`'user joined'`
- 建議使用有意義的名稱，如 `'typing'`、`'new notification'`
- ⚠️ 避免使用系統預設名稱：`'connect'`、`'disconnect'`、`'error'`

### 事件傳遞對應表

| 客戶端                         | 伺服器端                       | 說明                    |
| ------------------------------ | ------------------------------ | ----------------------- |
| `socket.emit('事件A', 資料)`   | `socket.on('事件A', callback)` | 客戶端發送 → 伺服器接收 |
| `socket.on('事件B', callback)` | `io.emit('事件B', 資料)`       | 伺服器發送 → 客戶端接收 |

### 資料流視覺化

```
發送訊息：
[客戶端] socket.emit('chat message', '你好')   ---> [伺服器] socket.on('chat message', callback)

廣播訊息：
[伺服器] io.emit('chat message', '你好')       ---> [所有客戶端] socket.on('chat message', callback)
```

### 使用場景建議

1. **使用 `socket.emit()` 的場景：**

   - 對用戶請求的直接回應
   - 發送個人化內容
   - 通知特定用戶的操作結果
   - 私人聊天訊息

2. **使用 `io.emit()` 的場景：**

   - 系統公告
   - 全體通知
   - 重要更新訊息
   - 全球性事件（如比賽得分更新）

3. **使用 `socket.broadcast.emit()` 的場景：**
   - 用戶動態通知（有人加入/離開）
   - 聊天室訊息（發送者不需要收到自己的訊息）
   - 用戶狀態變更（有人正在輸入...）
   - 多人遊戲中的玩家動作廣播

## 四種主要通訊模式

### 1. 點對點發送 (私訊)

```javascript
// 伺服器：只發給一個人
socket.emit("private message", { content: "這是只給你的訊息" });

// 客戶端：接收私人訊息
socket.on("private message", (data) => {
  console.log("收到私訊：", data.content);
});
```

### 2. 廣播 (除了發送者外的所有人)

```javascript
// 伺服器：發給除了發送者外的所有人
socket.broadcast.emit("announcement", "有新用戶加入");

// 客戶端：接收公告
socket.on("announcement", (message) => {
  console.log("公告：", message);
});
```

### 3. 全體廣播 (所有人)

```javascript
// 伺服器：發給所有人
io.emit("global message", "系統維護通知");

// 客戶端：接收全體訊息
socket.on("global message", (message) => {
  console.log("系統通知：", message);
});
```

### 4. 房間訊息 (特定群組)

```javascript
// 伺服器：處理加入房間
socket.on("join room", (room) => {
  socket.join(room);
});

// 伺服器：發送訊息到特定房間
io.to("JavaScript討論區").emit("room message", "有新訊息");

// 客戶端：接收房間訊息
socket.on("room message", (message) => {
  console.log("房間訊息：", message);
});
```

## 通訊模式實用案例

### 私訊應用：個人化歡迎訊息

```javascript
// 伺服器端
io.on("connection", (socket) => {
  // 只有新連接的使用者會收到這條訊息
  socket.emit("welcome", "歡迎來到聊天室！");
});

// 客戶端
socket.on("welcome", (msg) => {
  showNotification(msg); // 輸出：歡迎來到聊天室！
});
```

### 廣播應用：系統公告

```javascript
// 伺服器端
io.on("connection", (socket) => {
  socket.on("announce", (msg) => {
    // 所有人都會收到，包括發送者
    io.emit("announcement", `系統公告：${msg}`);
  });
});

// 客戶端
socket.on("announcement", (msg) => {
  showAnnouncement(msg); // 輸出：系統公告：伺服器將於今晚維護
});
```

### 悄悄話應用：使用者動態通知

```javascript
// 伺服器端
io.on("connection", (socket) => {
  socket.on("set username", (username) => {
    socket.username = username;
    // 只有其他人會收到有新使用者加入的通知，發送者不會收到
    socket.broadcast.emit("user joined", `${username} 加入了聊天室`);
  });
});

// 客戶端
socket.on("user joined", (msg) => {
  showNotification(msg); // 輸出：小明 加入了聊天室
});
```

### 聊天室應用基本功能

1. **顯示誰正在輸入**

```javascript
// 客戶端：發送正在輸入狀態
input.addEventListener("input", () => {
  socket.emit("typing", true);
});

// 伺服器：廣播給其他人
socket.on("typing", (isTyping) => {
  socket.broadcast.emit("typing status", {
    username: socket.username,
    isTyping: isTyping,
  });
});
```

2. **顯示上線/離線通知**

```javascript
// 伺服器：監聽連接與斷開
io.on("connection", (socket) => {
  // 廣播新用戶加入
  socket.broadcast.emit("user joined", "有人加入了聊天室");

  socket.on("disconnect", () => {
    io.emit("user left", "有人離開了聊天室");
  });
});
```

## 常見問題與排解

### 事件發送了但沒收到？

1. **檢查事件名稱是否一致**

   - 事件名稱區分大小寫
   - 伺服器和客戶端必須使用完全相同的名稱

2. **檢查連接是否成功**

   ```javascript
   // 客戶端：監聽連接成功
   socket.on("connect", () => {
     console.log("已連接到伺服器");
   });

   // 客戶端：監聽連接錯誤
   socket.on("connect_error", (error) => {
     console.log("連接失敗：", error);
   });
   ```

3. **開啟除錯模式查看詳細訊息**
   ```javascript
   // 開啟除錯模式
   localStorage.debug = "*";
   const socket = io();
   ```

### 效能與記憶體問題

- 大量事件監聽時記得在不使用時移除
- 不要在短時間內頻繁發送大量事件
- 考慮使用節流或防抖動技術限制事件發送頻率
