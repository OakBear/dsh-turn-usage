/**
 * 每轮 token 用量账本。
 *
 * 记录粒度: attempt（一次模型请求）。
 * turn 汇总: 同 turn 的所有 attempt 求和后返回（firstTs 为该轮首次请求时间）。
 */
export class TurnUsageLedger {
  #limit;
  /** Map<sessionId, rows[]>，rows 为按到达顺序的环形数组 */
  #sessions = new Map();

  constructor(limit = 200) { this.#limit = limit; }

  /**
   * 观察一个 durable 事件；只关心带 usage 的 assistant 结算事件。
   * @param sessionId string
   * @param event durable event（含 type/data）
   * @param ts number 事件信封时间戳（ms）
   */
  observe(sessionId, event, ts) {
    if (event?.type !== 'assistant/message' && event?.type !== 'assistant/attempt') return;
    const usage = usageOf(event);
    if (!usage) return;
    const { turn, step } = event.data;
    this.#push(sessionId, {
      turn, step,
      kind: event.type === 'assistant/message' ? 'message' : 'attempt',
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      cacheReadTokens: usage.cacheReadTokens ?? 0,
      cacheWriteTokens: usage.cacheWriteTokens ?? 0,
      ts: Number.isFinite(ts) ? ts : Date.now(),
    });
  }

  #push(sessionId, row) {
    let rows = this.#sessions.get(sessionId);
    if (!rows) { rows = []; this.#sessions.set(sessionId, rows); }
    // 同一请求（turn+step）可能结算两次：assistant/attempt（中断路径，usage 在 stream 里）
    // 与 assistant/message（正常路径，顶层 usage + stream 样本）。二者的样本可能不一致，
    // 覆盖顺序会造成"命中数来回翻转"。规则：assistant/message 是权威结算（正常完成时总是
    // 最后落账且带顶层 usage），attempt 只在还没有 message 覆盖时生效。
    const idx = rows.findIndex(r => r.turn === row.turn && r.step === row.step);
    if (idx >= 0) {
      const prev = rows[idx];
      if (prev.kind === 'message' && row.kind === 'attempt') return; // message 已定，attempt 不覆盖
      rows[idx] = row;
    } else {
      rows.push(row);
    }
    if (rows.length > this.#limit) rows.splice(0, rows.length - this.#limit);
  }

  /**
   * 列出最近的模型请求，一个请求（step/attempt）一行（新→旧）。
   * @param limit number 返回条数
   * @param sessionId? string 不传则所有 session 混合按时间排序
   */
  list(limit = 60, sessionId) {
    const sources = sessionId
      ? [[sessionId, this.#sessions.get(sessionId) ?? []]]
      : [...this.#sessions.entries()];
    const all = [];
    for (const [sid, rows] of sources) {
      for (const r of rows) all.push({ sessionId: sid, turn: r.turn, step: r.step, ts: r.ts,
        inputTokens: r.inputTokens, outputTokens: r.outputTokens,
        cacheReadTokens: r.cacheReadTokens, source: r.kind });
    }
    all.sort((a, b) => b.ts - a.ts);
    return all.slice(0, limit).map(t => ({ ...t, cacheHitPct: hitPct(t) }));
  }

  clear(sessionId) {
    if (sessionId) this.#sessions.delete(sessionId);
    else this.#sessions.clear();
  }
}

function hitPct(t) {
  const billed = t.inputTokens + t.cacheReadTokens;
  if (billed <= 0) return null;
  return Math.round((t.cacheReadTokens / billed) * 1000) / 10;
}

/** 与 dsh-token-meter 相同的 usage 提取口径 */
function usageOf(event) {
  if (event.type === 'assistant/message' && event.data.usage !== undefined) return event.data.usage;
  if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return undefined;
  const stream = event.data.stream;
  if (!Array.isArray(stream)) return undefined;
  for (let i = stream.length - 1; i >= 0; i -= 1) {
    const chunk = stream[i];
    if (chunk?.type === 'usage' && chunk.usage) return chunk.usage;
  }
  return undefined;
}
