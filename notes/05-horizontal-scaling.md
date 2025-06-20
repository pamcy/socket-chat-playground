# Socket.IO 水平擴展 (Horizontal Scaling)

## 目錄

- [什麼是水平擴展？](#什麼是水平擴展)
- [Node.js 單執行緒限制](#nodejs-單執行緒限制)
- [Adapter 的核心作用](#adapter-的核心作用)
- [Cluster Adapter 實作](#cluster-adapter-實作)
- [多伺服器架構原理](#多伺服器架構原理)
- [其他 Adapter 選項](#其他-adapter-選項)
- [實際部署考量](#實際部署考量)
- [與現有架構的對比](#與現有架構的對比)
- [最佳實踐建議](#最佳實踐建議)

## 什麼是水平擴展？

### 兩種擴展方式

- **水平擴展 (Horizontal Scaling / Scale Out)**: 增加更多伺服器來處理負載
- **垂直擴展 (Vertical Scaling / Scale Up)**: 增加現有伺服器的資源（CPU、記憶體、儲存等）

### 為什麼需要水平擴展？

當你的即時應用需要支援**數千個並發客戶端**時，單一伺服器可能無法承受負載。水平擴展讓你能夠：

- 分散負載到多個伺服器
- 提高系統可用性（一台掛掉不影響全部）
- 更好地利用多核心 CPU

## Node.js 單執行緒限制

### 核心問題

```javascript
// 問題：即使有 32 核心 CPU，也只用到 1 個核心
const server = createServer(app);
const io = new Server(server);
server.listen(3000); // 只使用單一執行緒
```

**實際影響**：

- 32 核心 CPU → 只用 1 核心
- 浪費 31 個核心的運算能力
- 無法處理大量並發連線

### 解決方案：Node.js Cluster 模組

```javascript
import cluster from "node:cluster";
import { availableParallelism } from "node:os";

if (cluster.isPrimary) {
  const numCPUs = availableParallelism();

  // 每個 CPU 核心建立一個 worker
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork({
      PORT: 3000 + i, // 每個 worker 使用不同 port
    });
  }
} else {
  // Worker 程序：實際的 Socket.IO 伺服器
  const app = express();
  const server = createServer(app);
  const io = new Server(server);

  server.listen(process.env.PORT);
}
```

## Adapter 的核心作用

### 什麼是 Adapter？

**Adapter** 是 Socket.IO 的訊息路由器，負責在不同伺服器實例之間轉發事件。

### 單一伺服器 vs 多伺服器

#### 🔸 單一伺服器（目前架構）

```
[客戶端 A] ─┐
            ├─ [Socket.IO 伺服器] ─ 直接廣播訊息
[客戶端 B] ─┘
```

- 所有客戶端連接到同一個實例
- `io.emit()` 直接發送給所有客戶端
- 使用預設的 in-memory adapter

#### 🔸 多伺服器（需要 Adapter）

```
[客戶端 A] ── [伺服器 1:3000]
                    ↓ io.emit("message", "hello")
                    ❌ 客戶端 B 收不到！

[客戶端 B] ── [伺服器 2:3001]
```

**問題**：不同伺服器的客戶端無法互相通訊

#### 🔸 使用 Adapter 後

```
[客戶端 A] ── [伺服器 1] ─┐
                          ├─ [Adapter] ─ 負責轉發事件
[客戶端 B] ── [伺服器 2] ─┘
```

**運作流程**：

1. 客戶端 A 發送訊息到伺服器 1
2. 伺服器 1 呼叫 `io.emit("chat:message", msg)`
3. Adapter 偵測到廣播事件
4. Adapter 將事件轉發給伺服器 2
5. 伺服器 2 將訊息發送給客戶端 B

## Cluster Adapter 實作

### 安裝

```bash
npm install @socket.io/cluster-adapter
```

### 完整程式碼架構

```javascript
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { availableParallelism } from "node:os";
import cluster from "node:cluster";
import { createAdapter, setupPrimary } from "@socket.io/cluster-adapter";

if (cluster.isPrimary) {
  const numCPUs = availableParallelism();

  // 建立多個 worker（每個 CPU 核心一個）
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork({
      PORT: 3000 + i,
    });
  }

  // 設定 adapter 主程序
  setupPrimary();
} else {
  // Worker 程序
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    connectionStateRecovery: {},
    // 每個 worker 都使用 cluster adapter
    adapter: createAdapter(),
  });

  // 你的 Socket.IO 邏輯...
  io.on("connection", (socket) => {
    socket.on("chat:message", (msg) => {
      // 這個 emit 會透過 adapter 發送給所有 worker 的所有客戶端
      io.emit("chat:message", msg);
    });
  });

  // 每個 worker 監聽不同 port
  const port = process.env.PORT;
  server.listen(port, () => {
    console.log(`server running at http://localhost:${port}`);
  });
}
```

### 運作情況

假設 4 核心 CPU：

```
客戶端 A ──► Worker 1 (port 3000) ─┐
                                    ├─ Cluster Adapter ─ 轉發訊息
客戶端 B ──► Worker 2 (port 3001) ─┤
客戶端 C ──► Worker 3 (port 3002) ─┤
客戶端 D ──► Worker 4 (port 3003) ─┘
```

當客戶端 A 發送訊息時，所有客戶端（B、C、D）都會收到，即使他們連接到不同的 worker。

## 多伺服器架構原理

### 程序分工

#### 主程序 (Primary Process)

- 管理 worker 程序的生命週期
- 設定 adapter 的主程序
- 不處理實際的 Socket.IO 連線

#### Worker 程序 (Worker Process)

- 處理實際的 Socket.IO 連線
- 執行業務邏輯
- 透過 adapter 與其他 worker 通訊

### IPC 通訊機制

Cluster Adapter 使用 Node.js 的 **IPC (Inter-Process Communication)** 來實現程序間通訊：

```
Worker 1 ─┐
          ├─ IPC Channel ─ 主程序協調 ─ IPC Channel ─┐
Worker 2 ─┘                                         ├─ Worker 3
                                                     ├─ Worker 4
                                                     └─ ...
```

## 其他 Adapter 選項

### 官方提供的 5 種 Adapter

| Adapter 類型          | 適用場景       | 通訊方式               | 擴展能力 |
| --------------------- | -------------- | ---------------------- | -------- |
| Memory Adapter        | 單一程序       | 記憶體                 | 無       |
| **Cluster Adapter**   | **單機多程序** | **Node.js IPC**        | **中等** |
| Redis Adapter         | 跨機器多伺服器 | Redis Pub/Sub          | 高       |
| Redis Streams Adapter | 跨機器多伺服器 | Redis Streams          | 高       |
| MongoDB Adapter       | 跨機器多伺服器 | MongoDB Change Streams | 高       |
| Postgres Adapter      | 跨機器多伺服器 | PostgreSQL NOTIFY      | 高       |

### Redis Adapter 範例

```javascript
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

const pubClient = createClient({ host: "localhost", port: 6379 });
const subClient = pubClient.duplicate();

const io = new Server(server, {
  adapter: createAdapter(pubClient, subClient),
});
```

### 選擇建議

- **開發/小型專案**：Memory Adapter（預設）
- **單機生產環境**：Cluster Adapter
- **分散式部署**：Redis Adapter
- **高可用需求**：Redis Streams Adapter

## 實際部署考量

### Sticky Session 問題

一般情況下，多伺服器架構需要確保同一客戶端的所有 HTTP 請求都到達同一伺服器（sticky session）。

**但在這個架構中不需要**，因為：

- 每個 worker 使用不同的 port
- 客戶端直接連接到特定的 worker
- 沒有負載均衡器在中間分配請求

### 負載均衡配置

如果需要使用負載均衡器，可以這樣配置：

```nginx
upstream socketio {
    ip_hash;  # 確保 sticky session
    server localhost:3000;
    server localhost:3001;
    server localhost:3002;
    server localhost:3003;
}

server {
    listen 80;
    location / {
        proxy_pass http://socketio;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Connection State Recovery 相容性

⚠️ **重要注意**：某些 adapter 不支援 Connection State Recovery 功能。

- ✅ **支援**：Memory Adapter, Cluster Adapter
- ❌ **不支援**：部分 Redis 和 MongoDB adapter 實作

查看 [相容性矩陣](https://socket.io/docs/v4/tutorial/step-9) 確認選擇的 adapter 是否支援此功能。

## 與現有架構的對比

### 目前的單一程序架構

```javascript
// index.js (目前)
const app = express();
const server = createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {},
});

server.listen(3000);
```

**特點**：

- 只使用 1 個 CPU 核心
- 只監聽 port 3000
- 適合小規模應用

### 升級後的多程序架構

```javascript
// index.js (升級後)
if (cluster.isPrimary) {
  // 建立 4 個 worker（假設 4 核心）
  for (let i = 0; i < 4; i++) {
    cluster.fork({ PORT: 3000 + i });
  }
  setupPrimary();
} else {
  const io = new Server(server, {
    connectionStateRecovery: {},
    adapter: createAdapter(),
  });

  server.listen(process.env.PORT);
}
```

**特點**：

- 使用所有 CPU 核心
- 監聽多個 port (3000-3003)
- 理論上可處理 4 倍的並發連線

## 總結

Socket.IO 的水平擴展能夠：

- **充分利用硬體資源**：多核心 CPU 全部運用
- **提高並發處理能力**：理論上可達到核心數倍的效能提升
- **增強系統穩定性**：一個程序掛掉不影響其他程序
- **為未來擴展做準備**：從單機擴展到分散式架構

**關鍵要點**：

- Adapter 是多伺服器通訊的核心
- Cluster Adapter 適合單機多程序部署
- 每個 worker 使用不同 port 避免 sticky session 問題
- 需要考慮 Connection State Recovery 的相容性

這種架構特別適合需要處理大量即時連線的應用，如線上遊戲、即時協作工具、或大型聊天系統。

## 參考資料

- [Socket.IO Tutorial Step 9: Scaling horizontally](https://socket.io/docs/v4/tutorial/step-9)
- [Socket.IO Adapter 文件](https://socket.io/docs/v4/adapter/)
- [Node.js Cluster 模組文件](https://nodejs.org/api/cluster.html)
