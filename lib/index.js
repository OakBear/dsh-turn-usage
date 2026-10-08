import { TurnUsageLedger } from './ledger.js';

export const name = 'dsh-turn-usage';
export const inject = ['connection'];

/**
 * 服务端：监听 session 事件流，把每一轮 assistant 的 token 用量记进环形账本，
 * 通过自己的 /api/turn-usage RPC 供侧边栏客户端读取。
 *
 * usage 事件来源（与 DSH 自带 token-meter 相同的口径）：
 *   assistant/message  data.usage            （整条消息的最终用量）
 *   assistant/attempt  data.stream 里的 usage （流式分片的最终样本）
 * 一个 turn 可能因工具调用产生多个 step/attempt：每个 attempt 记一行，
 * turn 汇总行由账本聚合给出。
 */
const RING_LIMIT = 2000; // 每 session 最多 2000 条请求记录

export function apply(ctx) {
  const ledger = new TurnUsageLedger(RING_LIMIT);

  // 每个 session 维护重放游标；session/event 每次推一个已提交事件。
  // 注意: 回调第二参 event 就是刚提交的事件本身（见 dsh-session-projection 用法），
  // 但为了对重启/后到监听安全，这里仍按 session 游标重放，token-meter 同款模式。
  const cursors = new WeakMap();

  ctx.on('session/event', (session) => {
    let consumed = cursors.get(session) ?? 0;
    while (consumed < session.seq) {
      const event = session.eventAt(consumed);
      ledger.observe(session.id, event, event.time);
      consumed += 1;
    }
    cursors.set(session, consumed);
  });

  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/turn-usage', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        return new Response('JSON required', { status: 415 });
      }
      let message;
      try { message = await request.json(); } catch { return new Response('invalid JSON', { status: 400 }); }
      const reply = result => Response.json({ type: 'server-response', rpcId: message.rpcId, result });
      if (message.type !== 'client-request' || typeof message.rpcId !== 'string' || message.method !== 'turn-usage') {
        return reply({ ok: false, error: { code: 'bad-request', message: 'bad envelope', details: {} } });
      }
      try {
        // 兼容两种信封：拍平 { method, ...args }（正确形态），以及
        // 0.2.0 初版客户端误发的 { method, payload: {...} } 嵌套形态。
        const raw = message.payload ?? {};
        const payload = (raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload))
          ? { ...raw, ...raw.payload }
          : raw;
        let value;
        if (payload.method === 'usage.list') {
          // 0.2.0 session 隔离：usage.list 必须带 sessionId（当前会话），否则拒绝。
          // 服务端无从得知"客户端当前在看哪个会话"，混发全部数据就是串台的根源，
          // 所以这里强制由客户端显式声明；'*' 仅供明确的全局视图。
          const sid = payload.sessionId;
          if (typeof sid !== 'string' || sid.length === 0) {
            return reply({ ok: false, error: { code: 'session-required', message: 'usage.list 需要 sessionId（0.2.0 起 session 隔离）', details: {} } });
          }
          value = {
            sessions: ledger.list(payload.limit ?? 60, sid),
            now: Date.now(),
          };
        } else if (payload.method === 'usage.clear') {
          // 清空同样按会话隔离：只清客户端声明的会话；'*' 才是全清。
          const sid = payload.sessionId;
          if (typeof sid !== 'string' || sid.length === 0) {
            return reply({ ok: false, error: { code: 'session-required', message: 'usage.clear 需要 sessionId（0.2.0 起 session 隔离）', details: {} } });
          }
          ledger.clear(sid);
          value = { ok: true };
        } else {
          throw new Error('unsupported method');
        }
        return reply({ ok: true, value });
      } catch (e) {
        return reply({ ok: false, error: { code: 'turn-usage/failed', message: e.message, details: {} } });
      }
    },
  }), 'turn-usage: own RPC endpoint');

  ctx.logger.info('每轮 token 明细（turn-usage）已启用。');
}

export { TurnUsageLedger };
