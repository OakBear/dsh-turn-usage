// 回归测试：RPC 信封形态。0.2.0 初版 bug——客户端把业务参数嵌在
// { method, payload: {...} } 里，服务端读外层取不到 sessionId。
// 修复后：客户端拍平发送，服务端同时兼容两种形态。
import assert from 'node:assert/strict';

// 复刻服务端归一化逻辑（与 lib/index.js 保持一致）
function normalize(raw) {
  return (raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload))
    ? { ...raw, ...raw.payload }
    : raw;
}

// 1) 拍平形态（新客户端）：外层直接可读
{
  const message = { type: 'client-request', rpcId: 'r1', method: 'turn-usage',
    payload: { method: 'usage.list', limit: 400, sessionId: 'sess-a' } };
  const payload = normalize(message.payload);
  assert.equal(payload.method, 'usage.list');
  assert.equal(payload.sessionId, 'sess-a');
  assert.equal(payload.limit, 400);
}

// 2) 嵌套形态（0.2.0 初版客户端误发）：归一化后仍可读
{
  const message = { type: 'client-request', rpcId: 'r2', method: 'turn-usage',
    payload: { method: 'usage.list', payload: { limit: 400, sessionId: 'sess-b' } } };
  const payload = normalize(message.payload);
  assert.equal(payload.method, 'usage.list');
  assert.equal(payload.sessionId, 'sess-b');
}

// 3) 无参数调用不炸
{
  const payload = normalize({ method: 'usage.list' });
  assert.equal(payload.sessionId, undefined);
}

// 4) 端到端：用真实 ledger 走一遍归一化后的调用
{
  const { TurnUsageLedger } = await import('../lib/ledger.js');
  const ledger = new TurnUsageLedger();
  const mk = (inputTokens, time) => ({
    type: 'assistant/message',
    time,
    data: { turn: 1, step: 0, usage: { inputTokens, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } },
  });
  ledger.observe('sess-a', mk(10, 1), 1);
  ledger.observe('sess-b', mk(20, 2), 2);

  const handle = (raw) => {
    const payload = normalize(raw);
    if (payload.method === 'usage.list') return ledger.list(payload.limit ?? 60, payload.sessionId);
    throw new Error('unsupported');
  };

  const a = handle({ method: 'usage.list', sessionId: 'sess-a' });
  assert.equal(a.length, 1);
  assert.equal(a[0].inputTokens, 10);
  const b = handle({ method: 'usage.list', payload: { sessionId: 'sess-b' } });
  assert.equal(b.length, 1);
  assert.equal(b[0].inputTokens, 20);
}

console.log('envelope tests: all passed');
