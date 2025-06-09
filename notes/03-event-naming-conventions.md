# Socket.IO 事件命名慣例

## 推薦格式：Kebab Case

```javascript
socket.on("user-connected");
socket.on("chat-message");
socket.on("room-joined");
```

**為什麼選擇 kebab-case？**

- 易讀性高，視覺清晰
- 符合 HTML 屬性風格
- 在 URL 中不需編碼

## 核心原則

### 1. 動作 + 對象

```javascript
// ✅ 清楚明確
socket.on("message-sent");
socket.on("user-joined");
socket.on("room-created");

// ❌ 模糊不清
socket.on("update");
socket.on("data");
```

### 2. 表達狀態變化

```javascript
socket.on("typing-started");
socket.on("typing-stopped");
socket.on("connection-lost");
```

### 3. 保持一致性

整個專案使用同一種命名風格。

## 分類命名

### 基本分類

```javascript
// 用戶
socket.on("user-connected");
socket.on("user-typing");

// 訊息
socket.on("message-sent");
socket.on("message-deleted");

// 房間
socket.on("room-joined");
socket.on("room-left");
```

### 進階：Namespace 格式（大型專案）

```javascript
socket.on("user:join");
socket.on("chat:message");
socket.on("game:start");
socket.on("notification:new");
```

## 實用範例

### 聊天應用

```javascript
// 連線
socket.on("user:join");
socket.on("user:leave");

// 訊息
socket.on("message:send");
socket.on("message:receive");

// 狀態
socket.on("user:typing");
socket.on("user:active");
```

## 檢查清單

- [ ] 名稱清楚表達目的
- [ ] 使用一致的命名風格
- [ ] 避免縮寫和模糊詞彙
- [ ] 避免系統保留名稱（`connect`、`disconnect`、`error`）
- [ ] 大型專案考慮使用 namespace

## 快速決策

- **小專案**：`user-joined`
- **大專案**：`user:join`
- **保持一致**：選定一種格式後全專案統一使用
