# Socket.IO API 完整概述

## 目錄

- [通用 API (客戶端＆伺服器端)](#通用-api-客戶端伺服器端)
  - [基本事件發送](#基本事件發送)
  - [回應確認機制 (Acknowledgements)](#回應確認機制-acknowledgements)
  - [萬用監聽器 (Catch-all Listeners)](#萬用監聽器-catch-all-listeners)
- [伺服器端專用 API](#伺服器端專用-api)
  - [廣播機制](#廣播機制)
  - [房間系統 (Rooms)](#房間系統-rooms)
- [實用技巧與最佳實踐](#實用技巧與最佳實踐)
- [完整功能對照表](#完整功能對照表)

## 通用 API (客戶端＆伺服器端)

這些 API 在客戶端和伺服器端都可以使用，是 Socket.IO 的核心功能。

### 基本事件發送

#### 1. 單向發送訊息

最基本的通訊方式，就像發簡訊一樣，只管發送不要求回覆。

```javascript
// 發送方（可以是客戶端或伺服器端）
socket.emit("hello", "world");

// 接收方（可以是伺服器端或客戶端）
socket.on("hello", (arg) => {
  console.log(arg); // 'world'
});
```

**實際運作原理：**

- `emit()` 是「發射事件」的意思
- 第一個參數是事件名稱
- 第二個參數開始是要傳送的資料

#### 2. 多參數傳送

Socket.IO 支援一次傳送多個參數。

```javascript
// 客戶端發送多個參數
socket.emit("hello", 1, "2", { 3: "4", 5: Uint8Array.from([6]) });

// 伺服器端接收
io.on("connection", (socket) => {
  socket.on("hello", (arg1, arg2, arg3) => {
    console.log(arg1); // 1
    console.log(arg2); // '2'
    console.log(arg3); // { 3: '4', 5: <Buffer 06> }
  });
});
```

**支援的資料類型：**

- 基本型別：字串、數字、布林值
- 物件和陣列
- 二進位資料：ArrayBuffer、TypedArray、Buffer

⚠️ **重要提醒：** 不需要使用 `JSON.stringify()`！

```javascript
// ❌ 錯誤做法
socket.emit("hello", JSON.stringify({ name: "John" }));

// ✅ 正確做法
socket.emit("hello", { name: "John" });
```

**為什麼不需要 JSON.stringify()？**
Socket.IO 內建序列化機制，會自動處理物件的轉換，手動轉換反而會造成雙重序列化的問題。

### 回應確認機制 (Acknowledgements)

有時候你需要確認對方有沒有收到訊息，Socket.IO 提供兩種確認方式。

#### 方式一：使用回呼函數 (Callback)

這是傳統的 JavaScript 回呼模式，適合習慣回呼的開發者。

```javascript
// 客戶端發送並等待回應
socket.timeout(5000).emit("request", { foo: "bar" }, "baz", (err, response) => {
  if (err) {
    // 伺服器在 5 秒內沒有回應
    console.log("請求逾時");
  } else {
    console.log(response.status); // 'ok'
  }
});

// 伺服器端接收並回應
io.on("connection", (socket) => {
  socket.on("request", (arg1, arg2, callback) => {
    console.log(arg1); // { foo: 'bar' }
    console.log(arg2); // 'baz'

    // 處理請求後回應
    callback({
      status: "ok",
    });
  });
});
```

#### 方式二：使用 Promise (推薦)

現代 JavaScript 的非同步處理方式，程式碼更乾淨。

```javascript
// 客戶端使用 async/await
try {
  const response = await socket
    .timeout(5000)
    .emitWithAck("request", { foo: "bar" }, "baz");
  console.log(response.status); // 'ok'
} catch (e) {
  console.log("請求逾時或發生錯誤");
}

// 伺服器端回應方式相同
io.on("connection", (socket) => {
  socket.on("request", (arg1, arg2, callback) => {
    callback({ status: "ok" });
  });
});
```

**確認機制的實際應用場景：**

- 重要操作確認（如轉帳、刪除資料）
- 檔案上傳完成確認
- 敏感資料傳輸確認
- API 請求式的即時操作

**timeout() 的重要性：**

- 防止無限等待
- 網路問題時能及時處理
- 建議根據操作複雜度設定適當時間（一般 3-10 秒）

### 萬用監聽器 (Catch-all Listeners)

萬用監聽器讓你可以攔截所有傳入和傳出的事件，對偵錯和記錄非常有用。

#### 監聽所有傳入事件

```javascript
// 發送端
socket.emit("hello", 1, "2", { 3: "4", 5: Uint8Array.from([6]) });

// 接收端的萬用監聽器
socket.onAny((eventName, ...args) => {
  console.log(eventName); // 'hello'
  console.log(args); // [ 1, '2', { 3: '4', 5: ArrayBuffer (1) [ 6 ] } ]
});
```

#### 監聽所有傳出事件

```javascript
socket.onAnyOutgoing((eventName, ...args) => {
  console.log(eventName); // 'hello'
  console.log(args); // [ 1, '2', { 3: '4', 5: ArrayBuffer (1) [ 6 ] } ]
});
```

**萬用監聽器的實用場景：**

- **偵錯開發**：查看所有事件流向
- **監控系統**：記錄所有操作
- **分析工具**：分析用戶行為模式
- **安全審計**：監控可疑活動

## 伺服器端專用 API

### 廣播機制

伺服器端的核心功能，讓你可以同時向多個客戶端發送訊息。

#### 全域廣播

```javascript
// 向所有連接的客戶端發送訊息
io.emit("hello", "world");
```

```
廣播流程視覺化：
伺服器  ─┬─→ 客戶端 A
        ├─→ 客戶端 B
        ├─→ 客戶端 C
        └─→ 客戶端 D
```

**使用時機：**

- 系統公告
- 重要更新通知
- 伺服器狀態變更
- 全域事件（如新年倒數）

### 房間系統 (Rooms)

房間是 Socket.IO 的強大功能，讓你可以將客戶端分組管理，像是不同的聊天室或遊戲房間。

#### 房間基本操作

```javascript
io.on("connection", (socket) => {
  // 🚪 加入房間
  socket.join("some room");

  // 📢 向房間內所有人廣播
  io.to("some room").emit("hello", "world");

  // 📢 向房間外所有人廣播（排除房間內的人）
  io.except("some room").emit("hello", "world");

  // 🚪 離開房間
  socket.leave("some room");
});
```

```
房間廣播視覺化：
房間 A：客戶端 1, 2, 3
房間 B：客戶端 4, 5
未加入房間：客戶端 6, 7

io.to('房間 A').emit() ─→ 只有客戶端 1, 2, 3 收到
io.except('房間 A').emit() ─→ 客戶端 4, 5, 6, 7 收到
```

## 實用技巧與最佳實踐

### 1. 事件命名規範

```javascript
// ✅ 推薦的命名方式
"user:join"; // 使用冒號分隔命名空間
"chat:message"; // 功能:動作
"game:move"; // 清楚表達事件用途
"notification:read"; // 容易理解和維護

// ❌ 避免的命名方式
"msg"; // 太簡短，不清楚
"userJoinedTheRoom"; // 太冗長
"DATA"; // 全大寫，不符合慣例
```

### 2. 錯誤處理

```javascript
// 監聽連線錯誤
socket.on("connect_error", (error) => {
  console.log("連線失敗：", error);
});

// 監聽一般錯誤
socket.on("error", (error) => {
  console.log("Socket 錯誤：", error);
});

// 使用 try-catch 處理 emitWithAck
try {
  const response = await socket.timeout(5000).emitWithAck("request", data);
} catch (error) {
  console.log("請求失敗：", error.message);
}
```

### 3. 記憶體管理

```javascript
// 移除事件監聽器防止記憶體洩漏
socket.off("specificEvent");

// 移除所有監聽器
socket.removeAllListeners();

// 在 React 中的清理
useEffect(() => {
  socket.on("message", handleMessage);

  return () => {
    socket.off("message", handleMessage);
  };
}, []);
```

## 完整功能對照表

| 功能     | 方法                             | 適用端          | 用途                     |
| -------- | -------------------------------- | --------------- | ------------------------ |
| 基本發送 | `socket.emit()`                  | 客戶端/伺服器端 | 向特定連線發送事件       |
| 基本接收 | `socket.on()`                    | 客戶端/伺服器端 | 監聽特定事件             |
| 確認發送 | `socket.timeout().emitWithAck()` | 客戶端/伺服器端 | 發送並等待回應           |
| 萬用監聽 | `socket.onAny()`                 | 客戶端/伺服器端 | 監聽所有傳入事件         |
| 萬用監聽 | `socket.onAnyOutgoing()`         | 客戶端/伺服器端 | 監聽所有傳出事件         |
| 全域廣播 | `io.emit()`                      | 僅伺服器端      | 向所有連線廣播           |
| 排除廣播 | `socket.broadcast.emit()`        | 僅伺服器端      | 向除發送者外所有連線廣播 |
| 房間加入 | `socket.join()`                  | 僅伺服器端      | 加入指定房間             |
| 房間離開 | `socket.leave()`                 | 僅伺服器端      | 離開指定房間             |
| 房間廣播 | `io.to('room').emit()`           | 僅伺服器端      | 向指定房間廣播           |
| 房間排除 | `io.except('room').emit()`       | 僅伺服器端      | 向房間外廣播             |

**關鍵原則：**

- **客戶端**主要負責發送請求和接收回應
- **伺服器端**負責處理邏輯和控制廣播
- **房間系統**是伺服器端獨有的分組管理功能
- **確認機制**適用於重要操作，需要確保送達

這份 API 概述涵蓋了 Socket.IO 的所有核心功能，掌握這些就能建立強大的即時應用程式。記住：實務上最常用的是基本發送/接收、房間系統，以及在重要操作時使用確認機制。
