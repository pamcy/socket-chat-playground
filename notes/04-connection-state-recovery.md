# Connection State Recovery (連線狀態恢復)

## Table of Contents

- [什麼是 Connection State Recovery？](#什麼是-connection-state-recovery)
- [核心概念](#核心概念)
  - [1. Socket.IO 內建的 Connection State Recovery](#1-socketio-內建的-connection-state-recovery)
  - [2. 兩種狀態同步策略](#2-兩種狀態同步策略)
  - [3. 偏移量 (Offset) 機制](#3-偏移量-offset-機制)
- [伺服器端實作分析](#伺服器端實作分析)
  - [連線狀態檢查](#連線狀態檢查)
  - [訊息重複防護機制](#訊息重複防護機制)
- [客戶端實作分析](#客戶端實作分析)
  - [連線設定](#連線設定)
  - [訊息發送與確認](#訊息發送與確認)
  - [狀態更新](#狀態更新)
- [雙層恢復機制](#雙層恢復機制)
- [完整流程圖](#完整流程圖)
- [三種訊息傳遞保證](#三種訊息傳遞保證)
  - [1. At Most Once (最多一次) - 預設行為](#1-at-most-once-最多一次---預設行為)
  - [2. At Least Once (至少一次)](#2-at-least-once-至少一次)
  - [3. Exactly Once (恰好一次) - 我們的實作](#3-exactly-once-恰好一次---我們的實作)
- [測試斷線重連](#測試斷線重連)
  - [瀏覽器模擬](#瀏覽器模擬)
  - [程式碼測試](#程式碼測試)
- [關鍵技術細節](#關鍵技術細節)
  - [1. 資料庫設計](#1-資料庫設計)
  - [2. 錯誤處理](#2-錯誤處理)
  - [3. 記憶體優化](#3-記憶體優化)
- [實際應用考量](#實際應用考量)
  - [優點](#優點)
  - [限制](#限制)
  - [最佳實踐](#最佳實踐)
- [參考資料](#參考資料)

## 什麼是 Connection State Recovery？

Connection State Recovery 是 Socket.IO 4.x 新增的功能，目的是在客戶端短暫斷線後重新連線時，能夠自動恢復之前的連線狀態並補發錯過的訊息。

## 核心概念

### 1. Socket.IO 內建的 Connection State Recovery

在深入探討手動實作之前，先了解 Socket.IO 4.x 提供的內建 Connection State Recovery 功能。

#### 啟用方式

```javascript
const io = new Server(server, {
  connectionStateRecovery: {},
});
```

#### 運作原理

根據 [Socket.IO 官方教學](https://socket.io/docs/v4/tutorial/step-6)，這個功能會：

- **暫時儲存** 伺服器發送的所有事件
- **嘗試恢復** 客戶端重連時的狀態：
  - 恢復客戶端的房間 (rooms)
  - 發送任何錯過的事件

#### 檢查恢復狀態

```javascript
io.on("connection", async (socket) => {
  socket.emit(
    "system:announcement",
    `*Connected (recovered: ${socket.recovered})`
  );

  if (!socket.recovered) {
    // 內建恢復失敗，需要手動處理
    // 從資料庫補發錯過的訊息
  }
});
```

#### 為什麼不是預設啟用？

Socket.IO 官方文件提到幾個原因：

1. **不總是有效** - 如果伺服器突然崩潰或重啟，客戶端狀態可能無法保存
2. **擴展限制** - 在水平擴展 (scaling up) 時不總是可能啟用此功能
3. **記憶體考量** - 需要在記憶體中暫存事件資料

> 💡 **最佳實踐**: 內建的 Connection State Recovery 適合處理短暫的網路中斷（如 WiFi 切換到 4G），但對於更可靠的訊息傳遞，建議搭配資料庫持久化的方案。

### 2. 兩種狀態同步策略

根據 Socket.IO [官方文件](https://socket.io/docs/v4/tutorial/step-7)，有兩種常見的狀態同步方式：

1. **伺服器發送完整狀態** - 重連時發送所有資料
2. **客戶端追蹤偏移量** - 客戶端記錄最後處理的事件，伺服器只發送缺失的部分

我們的實作採用第二種方式，更有效率。

### 3. 偏移量 (Offset) 機制

- **Server Offset**: 伺服器端訊息的唯一 ID (資料庫自動遞增的主鍵)
- **Client Offset**: 客戶端生成的唯一識別符，用於防止重複訊息

## 伺服器端實作分析

### 連線狀態檢查

```javascript
if (!socket.recovered) {
  // 連線狀態無法自動恢復，需要手動補發訊息
  try {
    await db.each(
      "SELECT id, content FROM messages WHERE id > ?",
      [socket.handshake.auth.serverOffset || 0],
      (_err, row) => {
        socket.emit("chat:message", row.content, row.id);
      }
    );
  } catch (error) {
    console.error("Error fetching messages: ", error);
  }
}
```

**原理解析：**

- `socket.recovered`: Socket.IO 自動設定的屬性
  - `true`: 自動恢復成功，Socket.IO 已處理錯過的訊息
  - `false`: 自動恢復失敗，需要手動補發訊息
- `socket.handshake.auth.serverOffset`: 客戶端傳來的最後收到訊息 ID
- `db.each()`: 逐筆處理查詢結果，避免大量資料載入記憶體

### 訊息重複防護機制

```javascript
socket.on("chat:message", async (msg, clientOffset, callback) => {
  try {
    result = await db.run(
      "INSERT INTO messages (content, client_offset) VALUES (?, ?)",
      msg,
      clientOffset
    );
  } catch (error) {
    if (error.errno === 19) {
      // SQLITE_CONSTRAINT
      // 訊息已存在，通知客戶端已處理
      callback();
    }
    return;
  }

  io.emit("chat:message", msg, result.lastID);
  callback(); // 重要：必須確認訊息已處理
});
```

**防重複機制：**

- 資料庫 `client_offset` 欄位設為 `UNIQUE`
- 重複訊息會觸發 `SQLITE_CONSTRAINT` 錯誤 (errno: 19)
- 即使是重複訊息也要呼叫 `callback()` 通知客戶端

## 客戶端實作分析

### 連線設定

```javascript
const socket = io({
  auth: {
    serverOffset: 0, // 追蹤最後收到的訊息 ID
  },
  ackTimeout: 10000, // 等待確認伺服器回應的時間
  retries: 3, // 重試次數
});
```

### 訊息發送與確認

```javascript
form.addEventListener("submit", (e) => {
  if (input.value) {
    const clientOffset = `${socket.id}-${counter++}`;

    socket.emit("chat:message", input.value, clientOffset, (response) => {
      console.log("訊息已成功送達 server：", response);
    });
  }
});
```

**客戶端偏移量生成：**

- `socket.id`: 20 字元隨機識別符，每次連線都不同
- `counter++`: 遞增計數器，確保同一連線內的唯一性
- 組合格式：`"socketId-counter"`

### 狀態更新

```javascript
socket.on("chat:message", (msg, serverOffset) => {
  // 顯示訊息
  const item = document.createElement("li");
  item.textContent = msg;
  messages.appendChild(item);

  // 更新最後收到的訊息 ID
  socket.auth.serverOffset = serverOffset;
});
```

## 雙層恢復機制

這個實作結合了 Socket.IO 內建功能和手動資料庫恢復，形成雙層保護：

### 第一層：Socket.IO 內建恢復

- 處理短暫的網路中斷
- 從記憶體中恢復暫存的事件
- 速度快，但有限制

### 第二層：資料庫手動恢復

- 處理伺服器重啟或長時間斷線
- 從持久化儲存中恢復訊息
- 更可靠，但稍慢

## 完整流程圖

```
客戶端連線 → 伺服器檢查 socket.recovered
    ↓
recovered = true           recovered = false
    ↓                           ↓
Socket.IO 自動恢復        手動查詢資料庫補發訊息
(從記憶體恢復事件)         (從 SQLite 恢復訊息)
    ↓                           ↓
恢復完成 ←─────────────── 補發完成
```

## 三種訊息傳遞保證

### 1. At Most Once (最多一次) - 預設行為

- 特點：可能遺失訊息，但不會重複
- 適用：對訊息完整性要求不高的場景

### 2. At Least Once (至少一次)

```javascript
// 方法一：手動重試
function emit(socket, event, arg) {
  socket.timeout(5000).emit(event, arg, (err) => {
    if (err) {
      emit(socket, event, arg); // 重試
    }
  });
}

// 方法二：使用 retries 選項
const socket = io({
  ackTimeout: 10000,
  retries: 3,
});
```

### 3. Exactly Once (恰好一次) - 我們的實作

- 結合重試機制 + 唯一識別符
- 防止訊息遺失和重複
- 適用：對訊息完整性要求高的場景

## 測試斷線重連

### 瀏覽器模擬

1. 開啟 DevTools → Network 分頁
2. 勾選 "Offline" 模擬斷網
3. 等幾秒後取消勾選
4. 觀察控制台顯示 `recovered: true/false`

### 程式碼測試

程式碼中有包含了手動斷線重連的測試按鈕：

```javascript
// 手動斷線重連按鈕
disconnectButton.addEventListener("click", (e) => {
  e.preventDefault();

  if (socket.connected) {
    disconnectButton.textContent = "Connect";
    socket.disconnect();
  } else {
    disconnectButton.textContent = "Disconnect";
    socket.connect();
  }
});
```

**測試步驟**：

1. 發送一些訊息
2. 點擊 "Disconnect" 按鈕
3. 在其他瀏覽器視窗發送訊息
4. 點擊 "Connect" 按鈕重新連線
5. 觀察是否收到錯過的訊息和 `recovered` 狀態

## 關鍵技術細節

### 1. 資料庫設計

```sql
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 伺服器偏移量
  client_offset TEXT UNIQUE,             -- 客戶端偏移量（防重複）
  content TEXT                           -- 訊息內容
);
```

### 2. 錯誤處理

- **網路錯誤**: 自動重試機制
- **資料庫錯誤**: 根據錯誤類型決定是否重試
- **重複訊息**: UNIQUE 約束防護

### 3. 記憶體優化

- 使用 `db.each()` 而非 `db.all()` 避免大量資料載入
- 客戶端只追蹤必要的偏移量資訊

## 實際應用考量

### 優點

- 自動處理短暫斷線
- 確保訊息完整性
- 防止訊息重複
- 用戶體驗佳

### 限制

- 需要持久化儲存
- 增加伺服器複雜度
- 不適合大量歷史訊息的場景

### 最佳實踐

- 定期清理舊訊息避免資料庫過大
- 設定合理的重試次數和超時時間
- 監控錯誤日誌以優化穩定性

## 參考資料

- [Socket.IO Tutorial Step 6: Connection state recovery](https://socket.io/docs/v4/tutorial/step-6)
- [Socket.IO Tutorial Step 7: Server delivery](https://socket.io/docs/v4/tutorial/step-7)
- [Socket.IO Tutorial Step 8: Client delivery](https://socket.io/docs/v4/tutorial/step-8)
