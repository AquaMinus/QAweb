# QAweb 架构设计文档

## 1. 整体架构

```
浏览器(前端SPA) ←HTTP/WS→ Hono服务器 ←→ SQLite(持久化)
                        ↕
                   内存游戏引擎(Room × N)
```

- **前端**：SvelteKit SPA，纯静态，WebSocket 直连后端
- **后端**：单进程 Node.js，HTTP(REST) + WebSocket 同端口
- **持久化**：SQLite WAL 模式。用户、题库、**游戏历史**落库。游戏进行中的状态纯内存
- **部署**：前端放 CDN(Cloudflare Pages)，后端单文件部署

## 2. 数据库 (9 表)

### 2.1 用户与内容（6 表）

```
hosts                 — 主持人账号（username 登录，email/displayName 可选）
password_reset_tokens — 密码重置令牌(1小时有效，支持用户名或邮箱查询)
question_sets         — 题集(归属host)
questions             — 题目(归属question_set)
options               — 选项(每题4个, 颜色 red/blue/yellow/green)
share_tokens          — 分享令牌(有时效)
```

### 2.2 游戏历史（3 表）

```
game_rooms            — 已结束的游戏房间元信息
game_player_results   — 每场每玩家的汇总成绩(排名/正确数/连击)
game_answer_records   — 每场每题每玩家的答题记录(选项/得分/用时)
```

所有 ID 用 UUID v4，时间戳用 Unix ms。游戏进行中的数据（房间、玩家、当前答案）不落库，仅在 `ended` 阶段一次性写入历史表。历史数据采用冗余存储（题目文本、玩家名、选项文本），防止题库删除后历史无法查看。

## 3. 核心模块

### 3.1 游戏引擎 `modules/quiz/quiz.engine.ts`

单例类，管理所有活跃房间。核心数据结构：

```typescript
// 房间 (内存中)
Room {
  pin: string              // 6位数字
  hostId, hostWs           // 主持人身份+连接
  questionSetId, questionSetTitle  // 题库引用
  questions: CachedQuestion[]  // 从DB载入的题目缓存
  currentQuestionIndex     // 当前第几题 (0-based)
  phase: RoomPhase         // 状态
  players: Map<token, Player>
  settings: RoomSettings   // 时限/分值/计分模式/推进模式/显示题干
  readingPhase: bool       // 是否在3秒审题期
  gameStartedAt            // 游戏开始时间（用于历史记录）
}

Player {
  sessionToken, name, ws
  answers: Map<questionId, PlayerAnswer>
  totalScore, streak, disconnected
  clockOffset, clockLatency  // NTP 时钟同步参数
}

RoomSettings {
  timeLimitSec, maxPoints
  scoringMode, advanceMode
  autoAdvanceDelayMs
  showQuestionText         // 玩家端是否显示题干+选项
}
```

**7 阶段状态机**：

```
lobby → countdown → question → question_result → leaderboard → podium → ended
        (3-2-1)   (审题3s+答题)  (结果+排行榜)
```

- `question` 阶段内部分为 **审题阶段**（3s，`readingPhase=true`，答案被拒绝）和 **答题阶段**（`readingPhase=false`）
- **自动模式**：`question_result` → 5s 倒计时 → 直接下一题（跳过 `leaderboard`）
- **手动模式**：主持人可在 `question_result` 阶段看结果+排行榜，手动推进

关键方法：
- `createRoom()` / `destroyRoom()` — 房间生命周期
- `joinRoom()` — 玩家加入，生成 sessionToken，查重名，初始化时钟字段
- `submitAnswer()` — 客户端时间戳 + 时钟偏移校验 → 合理性审计 → 计分
- `startQuiz()` → `startCountdown()` → `showQuestion()` → `revealResult()` → `goToNextOrPodium()` → `showPodium()`
- `advancePhase()` — 手动推进（支持 skipLeaderboard）
- `reconnectPlayer()` — 断线重连，发送状态快照

### 3.2 计分 `quiz.scoring.ts`

```typescript
fixed:       score = maxPoints                              // 1000
time_decay:  score = round((1 - elapsedMs / (2 × totalTimeMs)) × maxPoints)
```

**时间衰减曲线**：0ms 答对 → 1000 分（满分）；截至时刻答对 → 500 分（50%）；答错或超时 → 0 分。

`elapsedMs` = 客户端时间戳经 clockOffset 换算后的服务器时间 - 答题窗口起始时间。

### 3.3 时钟同步 `client/src/lib/clock.ts` + `index.ts`

**NTP 式 Ping-Pong 对时**：

1. 客户端 WebSocket 连接建立后发起 `sync:ping { clientTime: t0 }`
2. 服务端立即回复 `sync:pong { serverTime, clientTime }`
3. 客户端收到时记录 `t1`，计算：
   - `rtt = t1 - t0`
   - `delay = rtt / 2`
   - `timeOffset = (serverTime + delay) - t1`
4. 全局函数 `getSyncedTime() = Date.now() + timeOffset` 为后续所有时间计算提供基准

### 3.4 绝对时间戳发题

`showQuestion()` 下发绝对时间窗口（不再下发相对秒数）：

```json
{
  "readingEndsAt": 1719000003000,   // 审题结束 = 答题开始（Unix ms）
  "answerEndsAt": 1719000023000     // 答题截止（Unix ms）
}
```

- 审题阶段结束后，广播 `quiz:answer_phase { answerEndsAt }` 给 **所有人**（主持人和玩家）
- 主机端也独立显示 3s 审题倒计时，与玩家机制完全一致
- 服务端以 `answerEndsAt` 为准进行超时校验

### 3.5 双端校验答题

玩家点击选项时：
1. 客户端记录 `clientTime = getSyncedTime()`
2. 发送 `player:answer { optionId, clientTime }`
3. 服务端用 Player 存储的 `clockOffset` 将 `clientTime` 换算为服务器时间
4. 合理性审计：不能超前于当前服务器时间+延迟、不能早于答题窗口、不能晚于截止
5. 审计通过 → 计分；不通过 → 丢弃

### 3.6 前端 rAF 计时器 `client/src/lib/timer.ts`

基于 `requestAnimationFrame` 的倒计时渲染：

```
每帧: remaining = max(0, endTime - getSyncedTime())
     → 更新 displaySecs + barPct ($state 变量)
     → 仅触发绑定的文本节点和 style 属性更新，不触发组件 re-render
```

- 切标签页/卡主线程后恢复 → 立即显示正确的剩余时间
- 不追赶旧数值，不做假动画

### 3.7 WebSocket 消息路由 `quiz.ws.ts`

| 消息 | 方向 | 作用 |
|---|---|---|
| `sync:ping` / `sync:pong` | C↔S | 时钟同步握手 |
| `player:join` | C→S | 加入房间(name, pin) |
| `player:reconnect` | C→S | 断线重连(session_token) |
| `player:answer` | C→S | 提交答案(optionId + clientTime) |
| `host:start` | C→S | 开始游戏(advanceMode) |
| `host:next` | C→S | 手动推进(可 skipLeaderboard) |
| `host:end` | C→S | 结束游戏 |
| `host:kick` / `host:lock` | C→S | 踢人/锁定 |
| `room:joined` | S→C | 加入成功(返回 sessionToken) |
| `room:host_bound` | S→C | 主持人绑定(含完整状态快照) |
| `quiz:question` / `quiz:question_player` | S→C | 出题(含 readingEndsAt/answerEndsAt + rankings) |
| `quiz:answer_phase` | S→C | 审题结束，开始答题（含 answerEndsAt） |
| `quiz:result` / `quiz:result_player` | S→C | 答案揭晓(含 rankings) |
| `quiz:next_countdown` | S→C | 自动模式下一题倒计时 |

### 3.8 WS 连接管理 `ws/connection-manager.ts`

`Map<pin, Map<sessionToken, WebSocket>>` — 按房间+玩家两级索引，支持 sendToPlayer / broadcast / sendToHost。

### 3.9 WS 协议 `ws/protocol.ts`

消息格式：
```json
{ "type": "player:answer", "payload": { "optionId": "uuid", "clientTime": 1719000001000 }, "ts": 1234567890 }
```

### 3.10 历史记录与导出 `modules/rooms/rooms.persistence.ts`

- `saveGameRoom(room)`：游戏结束时持久化房间元信息 + 所有玩家排名 + 全部答题记录
- `getRoomHistory(hostId)`：查询主持人所有已结束房间
- `getRoomDetail(id)`：单场游戏完整详情
- `exportRoomExcel(id)`：生成 Excel（3 Sheet）：
  - **玩家排名**：排名/名称/总分/正确/错误/未答/连击
  - **答题统计**：每题作答人数/正确率/各选项选择人数
  - **答题明细**：每题每人选择/对错/得分/用时

### 3.11 连接处理 `index.ts`

WS 连接时解析 URL 参数：
- 连接建立 → `startHeartbeat` → 等待客户端发起时钟同步
- `role=host` → 解码 JWT 得 hostId，验证房间所有权，绑定 `room.hostWs`
- 否则 → 玩家连接。`player:join` 后 token 存 `ws._qaSessionToken`，后续消息用它查找玩家

## 4. 题库模块

### 4.1 导入格式

**CSV**：`question,option1,option2,option3,option4`，`*` 前缀标记正确答案。

**JSON**：`{ questions: [{ text, options: [{ text, isCorrect, color }] }] }`

**TXT**：空行分隔题目，首行题干，后续选项，`*` 前缀标记正确。

### 4.2 分享链接

`POST /api/questions/sets/:id/share { expiresInHours }` → 返回 token URL。`GET /api/questions/shared/:token` 免登录下载 JSON。

### 4.3 导出下拉

题集卡片上「📥」按钮为 hover 下拉菜单，支持导出 JSON 和 CSV 两种格式，带淡入淡出动画。

## 5. 前端状态管理

三个 Svelte 5 rune store（`$state`）：

| Store | 用途 |
|---|---|
| `auth.svelte.ts` | 主持人 JWT + 个人信息(username/email/displayName)，持久化 localStorage |
| `player.svelte.ts` | 玩家 PIN + 昵称 + sessionToken |
| `quiz.svelte.ts` | 当前题目/答题状态/倒计时/结果/排行榜 |

辅助模块：

| 模块 | 用途 |
|---|---|
| `clock.ts` | NTP 时钟同步，`getSyncedTime()` / `syncClock(ws)` |
| `timer.ts` | rAF 驱动倒计时，`startCountdown(endTime, totalMs, onTick)` |
| `ws.ts` | WebSocket 客户端，自动重连（指数退避，最多20次），`ws:open` 事件驱动 join/reconnect |

## 6. API 路由

| 路由 | 鉴权 | 功能 |
|---|---|---|
| `POST /api/auth/register` | 无 | 注册（username 必填，email/displayName 可选） |
| `POST /api/auth/login` | 无 | 登录（username，兼容旧邮箱） |
| `GET/PATCH /api/auth/me` | JWT | 个人信息（含 username 展示） |
| `POST /api/auth/change-password` | JWT | 改密码 |
| `POST /api/auth/forgot-password` | 无 | 忘记密码（支持用户名或邮箱） |
| `POST /api/auth/reset-password` | 无 | 重置密码 |
| `CRUD /api/questions/sets` | JWT | 题集管理 |
| `CRUD /api/questions/sets/:id/questions` | JWT | 题目管理 |
| `POST /api/questions/sets/:id/import` | JWT | 文件导入 |
| `GET /api/questions/sets/:id/export` | JWT | 文件导出(json/csv) |
| `POST /api/questions/sets/:id/share` | JWT | 生成分享链接 |
| `GET /api/questions/shared/:token` | 无 | 免登录下载 |
| `POST /api/rooms` | JWT | 创建房间（含 showQuestionText 等设置） |
| `GET /api/rooms/mine` | JWT | 我的活动房间 |
| `GET /api/rooms/:pin/check` | 无 | 玩家检查房间 |
| `DELETE /api/rooms/:pin` | JWT | 解散房间 |
| `GET /api/rooms/history` | JWT | 历史房间列表 |
| `GET /api/rooms/history/:id` | JWT | 历史房间详情 |
| `GET /api/rooms/history/:id/export` | JWT | 导出 Excel |
| `WS /ws` | 部分 | 游戏实时通信 + 时钟同步 |

## 7. 安全设计

- **JWT 2 小时过期**（可配 `JWT_EXPIRES_IN`），2h 无操作需重新登录
- **双端校验**：答案需通过时钟偏移合理性审计，杜绝时间作弊
- **防重名**：房间内玩家昵称唯一
- **防重答**：每题每个玩家只能提交一次答案
- **密码哈希**：bcrypt 12 轮
- **防枚举**：登录/忘记密码不泄露账号是否存在
