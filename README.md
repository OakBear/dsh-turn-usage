# dsh-turn-usage

侧边栏插件：显示**每一轮请求**的 token 明细 —— 时间戳、输入、缓存命中率、缓存写入、输出、请求数。

## 为什么需要它

底栏状态条的"缓存命中 XX%"是**整个会话的累计值**（token-meter 的 `tokenUsage` 投影对全部历史求和）。
上下文越大，累计值惯性越大：隔了很久发一条新消息，即使这一轮缓存完全没命中，
累计百分比也几乎不动。要看"最新一次请求真实吃到了多少缓存"，得看每轮自己的数字 —— 就是本插件。

## 结构

- `lib/index.js` — 服务端：`ctx.on('session/event')` 游标重放，提取 `assistant/message` /
  `assistant/attempt` 里的 usage（与 `dsh-token-meter` 相同口径），环形账本（200 条），
  经自有 `/api/turn-usage` RPC 暴露 `usage.list` / `usage.clear`。
  **0.2.0 起 RPC 强制要求 `sessionId`**（session 隔离），不带会被拒绝。
- `lib/ledger.js` — 账本：按 turn 聚合 attempt，算命中率 `cacheRead / (input + cacheRead + cacheWrite)`；
  记录本身按 sessionId 分桶，`list` / `clear` 均按会话过滤（`'*'` 才是全局）。
- `client-src/index.js` — 侧边栏 tab（注册到 `dsh-better-sidebar`），5 秒自动刷新可关，
  最新一轮命中率大字显示，颜色分档（≥80% 绿 / ≥40% 黄 / <40% 红）。
  **0.2.0 起从 tab 的 `props.scope.sessionId` 取当前会话 id**，所有请求按会话隔离：
  切换会话后各看各的记录，不再把所有会话混在一起。

## 0.2.0 变更：session 隔离

旧版（0.1.0）的侧边栏请求不带 sessionId，服务端把所有会话的记录混合按时间排序返回，
多会话使用时互相串台。0.2.0 的隔离口径：

1. 客户端从 better-sidebar 的 tab scope 取 `sessionId`，随每次 `usage.list` / `usage.clear` 请求携带；
2. 服务端校验 `sessionId` 必传，缺省直接返回 `session-required` 错误；
3. "清空"只清当前会话；全局清空需显式传 `'*'`（当前 UI 不提供）。

## 安装

在 profile 的 `package.json` 加：
`"dsh-turn-usage": "link:<本目录路径>"`，然后重启 dsh。

## 数据口径

- 输入 = `inputTokens`（未命中且未写入的 prompt 部分）
- 命中 = `cacheReadTokens` /（`inputTokens + cacheReadTokens + cacheWriteTokens`）
- 一轮含多次工具调用时，每个 attempt 累加；"请求"列显示该轮 attempt 数
