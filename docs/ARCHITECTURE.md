# QAweb 架构设计文档

## 1. 整体架构

```
浏览器(前端SPA) ←HTTP/WS→ Hono服务器 ←→ SQLite(持久化)
                        ↕
                   内存游戏引擎(Room × N)
```

- **前端**：SvelteKit SPA，纯静态，WebSocket 直连后端
- **后端**：单进程 Node.js，HTTP(REST) + WebSocket 同端口
- **持久化**：SQLite WAL 模式，只存用户/题库。游戏状态纯内存
- **部署**：前端放 CDN(Cloudflare Pages)，后端单文件部署

## 2. 数据库 (6 表)

```
hosts                 — 主持人账号
password_reset_tokens — 密码重置令牌(1小时有效)
question_sets         — 题集(归属host)
questions             — 题目(归属question_set)
options               — 选项(每题4个, 颜色 red/blue/yellow/green)
share_tokens          — 分享令牌(有时效)
```

所有 ID 用 UUID v4，时间戳用 Unix ms。游戏进行中的数据（房间、玩家、答案）不落库。

## 3. 核心模块

### 3.1 游戏引擎 `modules/quiz/quiz.engine.ts`

单例类，管理所有活跃房间。核心数据结构：

```typescript
// 房间 (内存中)
Room {
  pin: string              // 6位数字
  hostId, hostWs           // 主持人身份+连接
  questions: CachedQuestion[]  // 从DB载入的题目缓存
  currentQuestionIndex     // 当前第几题 (0-based)
  phase: RoomPhase         // 状态
  players: Map<token, Player>
  settings: RoomSettings   // 时限/分值/计分模式/推进模式
  readingPhase: bool       // 是否在3秒审题期
  answerPhaseStartedAt     // 答题计时起点(审题结束时刻)
}

Player {
  sessionToken, name, ws
  answers: Map<questionId, PlayerAnswer>
  totalScore, streak, disconnected
}
```

**7 阶段状态机**：

```
lobby → countdown → question → question_result → leaderboard → podium → ended
```

**自动模式 shortcut**：`question_result` 直接到下一题，跳过 `leaderboard`。

关键方法：
- `createRoom()` / `destroyRoom()` — 房间生命周期
- `joinRoom()` — 玩家加入，生成 sessionToken，查重名
- `submitAnswer()` — 校验阶段+审题期，计分，检查全员答完
- `startQuiz()` → `startCountdown()` → `showQuestion()` → `revealResult()` → `goToNextOrPodium()` → `showPodium()`
- `advancePhase()` — 手动推进（支持 skipLeaderboard）
- `reconnectPlayer()` — 断线重连，发送状态快照

### 3.2 计分 `quiz.scoring.ts`

```typescript
fixed:       score = maxPoints                              // 1000
time_decay:  score = max(round(maxPoints × (1 - t/T)), 250)  // 1000→250
```

`t = Date.now() - answerPhaseStartedAt`（不含审题时间），`T = settings.timeLimitSec × 1000`。

### 3.3 WebSocket 消息路由 `quiz.ws.ts`

| 消息 | 方向 | 作用 |
|---|---|---|
| `player:join` | C→S | 加入房间(name, pin) |
| `player:reconnect` | C→S | 断线重连(session_token) |
| `player:answer` | C→S | 提交答案(optionId = UUID) |
| `host:start` | C→S | 开始游戏 |
| `host:next` | C→S | 手动推进(可 skipLeaderboard) |
| `host:kick` / `host:lock` | C→S | 踢人/锁定 |
| `room:joined` | S→C | 加入成功(返回 sessionToken) |
| `room:host_bound` | S→C | 主持人绑定(含完整状态快照) |
| `quiz:question` / `quiz:question_player` | S→C | 出题(host见文字, player见色块+colorOptionIds映射) |
| `quiz:answer_phase` | S→C | 审题结束，开始答题倒计时 |
| `quiz:result` / `quiz:result_player` | S→C | 答案揭晓(分布图 / 个人得分) |
| `quiz:next_countdown` | S→C | 自动模式倒计时 |

### 3.4 WS 连接管理 `ws/connection-manager.ts`

`Map<pin, Map<sessionToken, WebSocket>>` — 按房间+玩家两级索引，支持 sendToPlayer / broadcast / sendToHost。

### 3.5 WS 协议 `ws/protocol.ts`

消息格式：
```json
{ "type": "player:answer", "payload": { "optionId": "uuid" }, "ts": 1234567890 }
```

### 3.6 连接处理 `index.ts`

WS 连接时解析 URL 参数：
- `role=host` → 解码 JWT 得 hostId，验证房间所有权，绑定 `room.hostWs`
- 否则 → 玩家连接。`player:join` 后 token 存 `ws._qaSessionToken`，后续消息用它查找玩家

## 4. 题库模块

### 4.1 导入格式

**CSV**：`question,option1,option2,option3,option4`，`*` 前缀标记正确答案。

**JSON**：`{ questions: [{ text, options: [{ text, isCorrect, color }] }] }`

**TXT**：空行分隔题目，首行题干，后续选项，`*` 前缀标记正确。

### 4.2 分享链接

`POST /api/questions/sets/:id/share { expiresInHours }` → 返回 token URL。`GET /api/questions/shared/:token` 免登录下载 JSON。

## 5. 前端状态管理

三个 Svelte 5 rune store（`$state`）：

| Store | 用途 |
|---|---|
| `auth.svelte.ts` | 主持人 JWT + 个人信息，持久化 localStorage |
| `player.svelte.ts` | 玩家 PIN + 昵称 + sessionToken |
| `quiz.svelte.ts` | 当前题目/答题状态/倒计时/结果/排行榜 |

WebSocket 客户端 (`ws.ts`)：自动重连（指数退避，最多20次），`ws:open` 事件驱动 join/reconnect。

## 6. API 路由

| 路由 | 鉴权 | 功能 |
|---|---|---|
| `POST /api/auth/register` | 无 | 注册 |
| `POST /api/auth/login` | 无 | 登录 |
| `GET/PATCH /api/auth/me` | JWT | 个人信息 |
| `POST /api/auth/change-password` | JWT | 改密码 |
| `POST /api/auth/forgot-password` | 无 | 忘记密码 |
| `POST /api/auth/reset-password` | 无 | 重置密码 |
| `CRUD /api/questions/sets` | JWT | 题集管理 |
| `CRUD /api/questions/sets/:id/questions` | JWT | 题目管理 |
| `POST /api/questions/sets/:id/import` | JWT | 文件导入 |
| `GET /api/questions/sets/:id/export` | JWT | 文件导出 |
| `POST /api/questions/sets/:id/share` | JWT | 生成分享链接 |
| `GET /api/questions/shared/:token` | 无 | 免登录下载 |
| `POST /api/rooms` | JWT | 创建房间 |
| `GET /api/rooms/mine` | JWT | 我的活动房间 |
| `GET /api/rooms/:pin/check` | 无 | 玩家检查房间 |
| `DELETE /api/rooms/:pin` | JWT | 解散房间 |
| `WS /ws` | 部分 | 游戏实时通信 |
