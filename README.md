# QAweb - 在线互动答题平台

仿 Kahoot 的多人实时答题系统。主持人创建房间，玩家通过 PIN 码 / QR 码 / URL 直链加入，实时答题竞技。

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Node.js + Hono + Drizzle ORM + SQLite + WebSocket (ws) |
| 前端 | SvelteKit SPA + TailwindCSS v4 |
| 部署 | 后端单进程，前端静态文件可放 CDN |

## 快速开始

```bash
# 后端 (端口 3000)
cd server && npm install && npm run dev

# 前端 (端口 5173，新终端)
cd client && npm install && npm run dev
```

打开 `http://localhost:5173`，**用户名密码登录**（旧版邮箱账号仍可兼容登录）。

> 首次使用需注册主持账号。用户名必填，昵称和邮箱选填（不填昵称默认使用用户名）。

## 项目结构

```
QAweb/
├── server/src/
│   ├── index.ts              # 入口：HTTP + WebSocket 服务器 + 时钟同步
│   ├── app.ts                # Hono 路由组装
│   ├── config.ts             # 环境配置（JWT 2h 过期）
│   ├── db/                   # SQLite 数据库 (9 表)
│   ├── modules/
│   │   ├── auth/             # 主持人注册/登录（用户名）/JWT鉴权
│   │   ├── questions/        # 题库 CRUD + 导入导出 + 分享链接
│   │   ├── rooms/            # 房间创建/管理 API + 持久化 + 历史记录
│   │   └── quiz/             # 核心游戏引擎（绝对时间戳 + 双端校验）
│   ├── ws/                   # WebSocket 连接管理/协议/心跳
│   └── shared/types.ts       # 共享类型定义
├── client/src/
│   ├── lib/                  # API/WS客户端 / 时钟同步(clock.ts) / rAF计时器(timer.ts) / Store / 类型
│   ├── routes/
│   │   ├── host/             # 主持人页面 (登录/注册/控制台/题库/房间/历史记录)
│   │   └── play/             # 玩家页面 (加入/答题)
│   └── components/           # 可复用UI组件
```

## 游戏流程

```
主持人创建房间 → 生成6位PIN + QR码 + 加入URL
→ 玩家扫码/输PIN/点链接加入 → 开始游戏
→ 3s审题倒计时 → 答题倒计时 → 揭晓答案（主持人端同步显示排行榜）
→ 5s倒计时后下一题(循环) → 领奖台 → 结束
→ 游戏结果持久化 → 历史记录可查看 + 导出 Excel
```

## 答题规则

- 每题 1000 分，两种计分模式：
  - **固定分值**：答对得 1000 分（满分）
  - **时间衰减**：`round((1 - elapsedMs / (2 × totalTimeMs)) × maxPoints)`，0ms 答对 1000 分，截止时刻 500 分
- 答错或超时得 0 分
- 每题前 3 秒为审题时间，不可作答，主持人和玩家同步显示审题倒计时
- 支持自动播放（全自动）和手动推进（主持人控制节奏）
- 玩家端可选显示题干+选项文字（房间设置），支持纯线上参与

## 主要特性

- **用户名登录**：用户名必填，邮箱和昵称选填，同时兼容旧邮箱账号登录
- **时钟同步**：NTP 式 Ping-Pong 对时 + 服务端绝对时间戳，消除网络延迟对公平性的影响
- **rAF 计时器**：基于 `requestAnimationFrame` 的倒计时渲染，切标签页不卡顿
- **双端校验**：答案需通过时钟偏移合理性审计，防作弊
- **多方式加入**：PIN 码 / QR 码 / URL 直链三种方式加入房间
- **实时排行榜**：主持人端题目和排行榜同步显示（左右分栏）
- **房间持久化**：游戏结束后自动保存排行榜 + 每题作答统计到数据库
- **历史记录**：主持人可查看往期游戏结果、每题答题分布，并导出 Excel（3 Sheet：玩家排名 / 每题统计 / 答题明细）
- **JWT 2h 过期**：登录 2 小时后需重新登录

## 部署指南

### 方案一：Docker 一键部署（推荐）

前后端同源部署，适合快速上线：

```bash
# 1. 克隆项目
git clone https://github.com/AquaMinus/QAweb.git && cd QAweb

# 2. 设置环境变量（可选，不设使用默认值）
export JWT_SECRET="your-random-secret-string"

# 3. 构建前端静态文件
cd client && npm install && npm run build
# 构建产物：client/build/

# 4. Docker Compose 启动后端
cd .. && docker compose up -d

# 5. 将前端静态文件也挂到后端 Hono 上，或使用 Nginx 反代
#    后端运行在 http://your-server:3000
#    前端 build/ 目录可放到任意静态文件服务器
```

**纯 Docker（不带 compose）：**

```bash
cd server
docker build -t qaweb-server .
docker run -d -p 3000:3000 \
  -v qaweb-data:/app/data \
  -e JWT_SECRET="your-random-secret" \
  qaweb-server
```

### 方案二：前后端分离 + CDN

前端放 Cloudflare Pages / Vercel，后端放轻量云服务器：

**后端部署（任选一台 Linux 服务器）：**

```bash
# 服务器上
git clone https://github.com/AquaMinus/QAweb.git && cd QAweb/server
npm install
export JWT_SECRET="production-random-secret"
export PORT=3000
npm run db:migrate
npx tsx src/index.ts &
# 用 systemd 或 pm2 管理进程更佳
```

**前端部署到 Cloudflare Pages：**

```bash
cd client

# 创建 .env.production
cat > .env.production << EOF
VITE_API_BASE=https://your-server.com/api
VITE_WS_BASE=https://your-server.com
EOF

npm install && npm run build
# 产物在 client/build/

# 上传 build/ 到 Cloudflare Pages（支持拖拽上传或 Git 集成）
```

配置 Cloudflare Pages：
1. 进入 Cloudflare Dashboard → Workers & Pages → Create → Pages
2. 上传 `client/build/` 目录或连接 Git 仓库
3. 设置构建命令：`cd client && npm install && npm run build`
4. 构建输出目录：`client/build`
5. 环境变量：`VITE_API_BASE` = `https://your-server.com/api`，`VITE_WS_BASE` = `https://your-server.com`

> ⚠️ Cloudflare Pages 未绑域名则自带 `*.pages.dev` 域名，HTTPS 自带。后端若未配 HTTPS 则 WS 需用 `wss:` → 建议后端也配 SSL（Nginx 反代 + Let's Encrypt）。

### 方案三：单机 Nginx 反代

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    root /path/to/QAweb/client/build;
    index index.html;
    try_files $uri /index.html;

    # API + WebSocket 反代到后端
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
    }
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

> 加上 SSL：`certbot --nginx -d your-domain.com`

### 关键环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 后端端口 |
| `JWT_SECRET` | `qaweb-dev-secret-...` | **生产必改**，JWT 签名密钥 |
| `JWT_EXPIRES_IN` | `2h` | 登录有效期 |
| `DB_PATH` | `./data/qaweb.db` | SQLite 文件路径 |
| `VITE_API_BASE` | `/api` | 前端 API 地址（CDN分离部署时设绝对URL） |
| `VITE_WS_BASE` | 同 origin | 前端 WebSocket 地址（CDN分离部署时设绝对URL） |
