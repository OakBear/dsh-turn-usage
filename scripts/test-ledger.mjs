/**
 * ledger.js session 隔离逻辑的快速验证脚本（node 直接跑，无测试框架依赖）。
 */
import { TurnUsageLedger } from '../lib/ledger.js';
import assert from 'node:assert/strict';

const mkEvent = (type, sessionIdIgnored, { turn, step, usage, stream }) => ({
  type,
  data: { turn, step, ...(usage ? { usage } : {}), ...(stream ? { stream } : {}) },
});

const usageA = { inputTokens: 100, outputTokens: 50, cacheReadTokens: 400, cacheWriteTokens: 0 };
const usageB = { inputTokens: 200, outputTokens: 60, cacheReadTokens: 0, cacheWriteTokens: 0 };

const ledger = new TurnUsageLedger(100);

// session S1：一个 message 结算
ledger.observe('S1', mkEvent('assistant/message', 'S1', { turn: 1, step: 0, usage: usageA }), 1000);
// session S1：attempt 流式样本（不应覆盖 message）
ledger.observe('S1', mkEvent('assistant/attempt', 'S1', { turn: 1, step: 0, stream: [{ type: 'usage', usage: usageB }] }), 1001);
// session S2：不同的 turn
ledger.observe('S2', mkEvent('assistant/message', 'S2', { turn: 7, step: 0, usage: usageB }), 2000);
// 无 usage 的事件应被忽略
ledger.observe('S2', mkEvent('assistant/message', 'S2', { turn: 8, step: 0 }), 2500);

// --- 隔离：按 session 过滤 ---
const s1 = ledger.list(60, 'S1');
assert.equal(s1.length, 1, 'S1 只应有 1 行');
assert.equal(s1[0].sessionId, 'S1');
assert.equal(s1[0].inputTokens, 100, 'S1 message 权威，不被 attempt 覆盖');
assert.equal(s1[0].turn, 1);

const s2 = ledger.list(60, 'S2');
assert.equal(s2.length, 1, 'S2 只应有 1 行');
assert.equal(s2[0].turn, 7, 'S2 无 usage 的 turn 8 不应记账');
assert.equal(s2[0].inputTokens, 200);

// S1 的数据不得出现在 S2 的视图里，反之亦然
assert.ok(!s2.some(r => r.sessionId === 'S1'));
assert.ok(!s1.some(r => r.sessionId === 'S2'));

// --- 不存在的 session 返回空 ---
assert.deepEqual(ledger.list(60, 'NOPE'), []);

// --- '*' 全局混合视图（兼容）---
const all = ledger.list(60, '*');
assert.equal(all.length, 2, "'*' 应返回两个会话共 2 行");
const mixed = ledger.list(60); // 不传：向后兼容旧行为（混合）
assert.equal(mixed.length, 2);

// --- 清空按会话隔离 ---
ledger.clear('S1');
assert.deepEqual(ledger.list(60, 'S1'), [], 'clear(S1) 后 S1 应为空');
assert.equal(ledger.list(60, 'S2').length, 1, 'clear(S1) 不得影响 S2');

ledger.clear('*');
assert.equal(ledger.list(60, '*').length, 0, "clear('*') 清空全部");

console.log('all ledger isolation tests passed');
