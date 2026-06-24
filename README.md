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
- **连击奖励**（可选）：连续答对 2/3/4/5/6+ 题分别额外 +100/200/300/400/500 分，答错清零

## 主要特性

- **用户名登录**：用户名必填，邮箱和昵称选填，同时兼容旧邮箱账号登录
- **登录过期验证**：每次打开页面调 `/auth/me` 校验 token，过期自动清除登录态
- **时钟同步**：NTP 式 Ping-Pong 对时 + 服务端绝对时间戳，消除网络延迟对公平性的影响
- **rAF 计时器**：基于 `requestAnimationFrame` 的倒计时渲染，切标签页不卡顿
- **双端校验**：答案需通过时钟偏移合理性审计，防作弊
- **多方式加入**：PIN 码 / QR 码 / URL 直链三种方式加入房间
- **实时排行榜**：主持人端题目和排行榜同步显示（左右分栏）
- **批量录入题库**：粘贴 CSV/JSON/TXT 文本直接转化为题目，自动检测格式 + 逐行校验反馈
  - 新建题集时可批量导入
  - 题集详情页「添加题目」弹窗内可批量追加
  - 创建房间时可粘贴题库一步开房
- **房间持久化**：游戏结束后自动保存排行榜 + 每题作答统计到数据库
- **历史记录**：主持人可查看往期游戏结果、每题答题分布，并导出 Excel（3 Sheet：玩家排名 / 每题统计 / 答题明细）
- **JWT 2h 过期**：登录 2 小时后需重新登录

## 部署指南

项目设计了三种部署方式，从最简单到最灵活依次排列。无论哪种方式，核心逻辑不变：**前端是一个纯静态 SPA，只需一个 HTTP 地址；后端是 Node.js 进程，提供 REST API 和 WebSocket。**

> 所有方案中，游戏数据存储在 `server/data/qaweb.db`（SQLite），持久化在该文件中，备份此文件即可。

---

### 方案一：Docker 一键部署（最简单，前后端一体）

一个 `docker compose up -d` 搞定全部。后端会自动挂载内嵌的前端静态资源，打开 `http://服务器IP:3000` 就能访问完整系统。

**步骤：**

```bash
# 1. 在服务器上克隆项目
git clone https://github.com/AquaMinus/QAweb.git
cd QAweb

# 2. 设置 JWT 密钥（生产环境务必修改！）
export JWT_SECRET="请替换为一个随机长字符串"

# 3. 启动
docker compose up -d

# 4. 验证
curl http://localhost:3000/api/health
```

访问 `http://你的服务器IP:3000` 即可使用。Docker 镜像内已包含前端构建产物，无需额外配置。

**自定义端口**（如改为 80）：

修改 `docker-compose.yml` 中 `ports: - "80:3000"`，然后 `docker compose up -d`。

---

### 方案二：Nginx 反代 + 后端（推荐有域名的场景）

在此方案中，Nginx 负责两件事：**把前端 HTML/JS/CSS 直接发给浏览器**，**把 `/api` 和 `/ws` 请求转发给后端**。

#### 架构示意

```
浏览器 ──→ Nginx (80/443)
              ├─ /          → 前端静态文件 (client/build/)
              ├─ /api/*     → 后端 localhost:3000
              └─ /ws        → 后端 localhost:3000 (WebSocket)
```

#### 步骤 1：部署后端

```bash
# 在服务器上
git clone https://github.com/AquaMinus/QAweb.git
cd QAweb/server

npm install
npm run db:migrate

# 创建 systemd 服务，保证进程一直运行
sudo tee /etc/systemd/system/qaweb.service << 'EOF'
[Unit]
Description=QAweb Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/QAweb/server
ExecStart=/usr/bin/npx tsx src/index.ts
Environment=PORT=3000
Environment=JWT_SECRET=你的随机密钥
Environment=JWT_EXPIRES_IN=2h
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now qaweb
```

#### 步骤 2：构建前端

```bash
cd QAweb/client

# 同源部署，无需设置 API 地址（使用默认的相对路径 /api）
npm install && npm run build
# 产物在 client/build/
```

#### 步骤 3：配置 Nginx

将 `client/build/` 放到服务器某个目录（如 `/var/www/qaweb/`），然后配置 Nginx：

```bash
sudo cp -r client/build/* /var/www/qaweb/
```

```nginx
# /etc/nginx/sites-available/qaweb
server {
    listen 80;
    server_name your-domain.com;          # ← 改成你的域名或服务器 IP

    # 前端静态文件
    root /var/www/qaweb;
    index index.html;

    # SPA 路由：所有非文件请求都返回 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 请求转发给后端
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket 转发给后端（聊天/答题实时通信）
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

启用并重载：

```bash
sudo ln -s /etc/nginx/sites-available/qaweb /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

#### 步骤 4：配置 HTTPS（强烈推荐）

WebSocket 在 HTTPS 下会自动升级为 `wss://`，安全且无中间人风险：

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

### 方案三：CDN 分离部署（前端放 Cloudflare Pages）

如果希望前端走 CDN 加速、后端单独部署，需要让前端知道后端的地址。

#### 架构示意

```
浏览器 ──→ Cloudflare Pages (前端静态文件，全球 CDN)
         ──→ 你的服务器 (后端 API + WebSocket)
```

#### 步骤 1：部署后端

同方案二的步骤 1，在服务器上启动后端进程。记下后端地址，如 `https://api.your-domain.com` 或 `http://12.34.56.78:3000`。

> 如果后端没有域名只有 IP，且没有配置 HTTPS，WebSocket 只能用 `ws://`。但 Cloudflare Pages 是 HTTPS，浏览器会阻止 HTTPS 页面发起 `ws://` 连接。**建议后端务必配 HTTPS + 域名**。

#### 步骤 2：构建前端（指定后端地址）

```bash
cd QAweb/client
npm install

# 创建环境变量文件，告诉前端后端地址
cat > .env.production << 'EOF'
VITE_API_BASE=https://api.your-domain.com/api
VITE_WS_BASE=https://api.your-domain.com
EOF

npm run build
# 产物在 client/build/
```

> `VITE_API_BASE` 和 `VITE_WS_BASE` 在构建时被硬编码进 JS 文件，浏览器直接用这些地址访问后端。

#### 步骤 3：上传到 Cloudflare Pages

方式 A — 手动上传（最快测试）：
1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages
2. Create → Pages → Upload assets
3. 项目名填写 `qaweb`，上传 `client/build/` 整个目录
4. 部署完成，获得 `qaweb-xxx.pages.dev` 地址

方式 B — Git 集成（自动部署）：
1. Fork 本项目到 GitHub
2. Cloudflare Pages → Create → Connect to Git
3. 构建设置：
   - Build command: `cd client && npm install && npm run build`
   - Output directory: `client/build`
   - Environment variables: `VITE_API_BASE` 和 `VITE_WS_BASE`

---

### 环境变量速查

| 变量 | 位置 | 默认值 | 说明 |
|------|------|--------|------|
| `PORT` | 后端 | `3000` | 后端监听端口 |
| `JWT_SECRET` | 后端 | 开发密钥 | **生产必改**，用于签发登录令牌 |
| `JWT_EXPIRES_IN` | 后端 | `2h` | 登录有效期，超时需重新登录 |
| `DB_PATH` | 后端 | `./data/qaweb.db` | SQLite 数据库路径 |
| `VITE_API_BASE` | 前端构建时 | `/api` | 后端 API 地址（CDN分离时填完整URL） |
| `VITE_WS_BASE` | 前端构建时 | 空(同源) | 后端 WebSocket 地址（CDN分离时填完整URL） |
