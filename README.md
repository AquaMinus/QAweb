# QAweb - 在线互动答题平台

仿 Kahoot 的多人实时答题系统。主持人创建房间，玩家通过 PIN 码加入，实时答题竞技。

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

打开 `http://localhost:5173`，测试账号：`demo@qa.com` / `123456`

## 项目结构

```
QAweb/
├── server/src/
│   ├── index.ts              # 入口：HTTP + WebSocket 服务器
│   ├── app.ts                # Hono 路由组装
│   ├── config.ts             # 环境配置
│   ├── db/                   # SQLite 数据库 (6 表)
│   ├── modules/
│   │   ├── auth/             # 主持人注册/登录/JWT鉴权
│   │   ├── questions/        # 题库 CRUD + 导入导出 + 分享链接
│   │   ├── rooms/            # 房间创建/管理 API
│   │   └── quiz/             # 核心游戏引擎
│   ├── ws/                   # WebSocket 连接管理/协议/心跳
│   └── shared/types.ts       # 共享类型定义
├── client/src/
│   ├── lib/                  # API客户端 / WS客户端 / 状态Store / 类型
│   ├── routes/
│   │   ├── host/             # 主持人页面 (登录/注册/控制台/题库/房间)
│   │   └── play/             # 玩家页面 (加入/答题)
│   └── components/           # 可复用UI组件
```

## 游戏流程

```
主持人创建房间 → 生成6位PIN → 玩家扫码输入PIN加入
→ 开始游戏 → 3s审题 → 答题倒计时 → 揭晓答案
→ 倒计时 → 下一题(循环) → 领奖台 → 结束
```

## 答题规则

- 每题 1000 分，两种计分模式：
  - **固定分值**：答对得 1000 分
  - **时间衰减**：越快答对分越高（1000 → 250）
- 答错或超时得 0 分
- 每题前 3 秒为审题时间，不可作答
- 支持自动播放（全自动）和手动推进（主持人控制节奏）
