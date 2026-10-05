import * as React from 'react';

const h = React.createElement;

export const name = 'turn-usage-client';

export const inject = ['connection', 'betterSidebar'];

const TAB_ID = 'turn-usage';

/* ---------- formatting ---------- */

const fmt = n => {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
};
const fmtTime = ts => {
  const d = new Date(ts);
  const p = x => String(x).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const hitColor = pct => {
  if (pct == null) return 'var(--dsh-text-muted, #888)';
  if (pct >= 80) return 'var(--dsh-green, #22a06b)';
  if (pct >= 40) return 'var(--dsh-yellow, #d97706)';
  return 'var(--dsh-red, #dc2626)';
};

/* ---------- row ---------- */

function TurnRow({ t }) {
  return h('tr', { style: { borderBottom: '1px solid var(--dsh-border, #e5e7eb)' } },
    h('td', { style: tdStyle, title: `turn ${t.turn} · step ${t.step}\n${new Date(t.ts).toLocaleString()}` }, fmtTime(t.ts)),
    h('td', { style: { ...tdStyle, textAlign: 'right' } }, fmt(t.inputTokens)),
    h('td', { style: { ...tdStyle, textAlign: 'right' } }, fmt(t.cacheReadTokens)),
    h('td', { style: { ...tdStyle, textAlign: 'right', color: hitColor(t.cacheHitPct), fontWeight: 600 } },
      t.cacheHitPct == null ? '—' : `${t.cacheHitPct}%`),
    h('td', { style: { ...tdStyle, textAlign: 'right' } }, fmt(t.outputTokens)),
  );
}

const tdStyle = { padding: '3px 8px', whiteSpace: 'nowrap', fontSize: 12 };

/* ---------- panel ---------- */

function TurnUsagePanel({ rpcCall, visible }) {
  const [rows, setRows] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [auto, setAuto] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      const value = await rpcCall('usage.list', { limit: 400 });
      setRows(value.sessions ?? []);
      setError(null);
    } catch (e) { setError(e.message); }
  }, [rpcCall]);

  React.useEffect(() => {
    if (visible === false) return;
    load();
    if (!auto) return;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load, auto, visible]);

  if (!visible) return null;

  const latest = rows?.[0];

  return h('div', { style: { padding: 12, overflow: 'auto', height: '100%', boxSizing: 'border-box' } },
    // 最新一轮摘要
    latest && h('div', { style: { marginBottom: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--dsh-bg-secondary, #f6f7f9)' } },
      h('div', { style: { fontSize: 12, opacity: 0.7, marginBottom: 2 } }, '最新一轮'),
      h('div', { style: { display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap' } },
        h('span', { style: { fontSize: 22, fontWeight: 700, color: hitColor(latest.cacheHitPct) } },
          latest.cacheHitPct == null ? '—' : `${latest.cacheHitPct}%`),
        h('span', { style: { fontSize: 12 } }, '缓存命中率'),
        h('span', { style: { fontSize: 12, opacity: 0.8 } }, `输入 ${fmt(latest.inputTokens)} · 输出 ${fmt(latest.outputTokens)}`),
      )),
    // 工具条
    h('div', { style: { display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' } },
      h('button', { onClick: load, style: btnStyle }, '刷新'),
      h('button', { onClick: () => setAuto(a => !a), style: btnStyle },
        auto ? '自动刷新: 开' : '自动刷新: 关'),
      h('button', {
        onClick: async () => { await rpcCall('usage.clear', {}); load(); }, style: btnStyle,
      }, '清空')),
    error && h('div', { style: { color: 'var(--dsh-red, #dc2626)', fontSize: 12, margin: '6px 0' } }, `读取失败: ${error}`),
    // 明细表
    h('table', { style: { borderCollapse: 'collapse', width: '100%' } },
      h('thead', null, h('tr', null,
        ['时间', '输入', '命中数', '命中', '输出'].map((title, i) =>
          h('th', {
            key: title,
            style: { ...tdStyle, textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, opacity: 0.6, position: 'sticky', top: 0, background: 'var(--dsh-bg, #fff)' },
          }, title)))),
      h('tbody', null, (rows ?? []).map((t, i) => h(TurnRow, { key: `${t.sessionId}-${t.turn}-${t.step}`, t })))),
    rows != null && rows.length === 0 && h('div', { style: { opacity: 0.6, padding: '12px 0' } },
      '还没有数据 — 发一条消息后这里会出现每一轮的用量。'),
  );
}

const btnStyle = {
  fontSize: 12, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
  border: '1px solid var(--dsh-border, #d1d5db)', background: 'var(--dsh-bg, #fff)',
  color: 'var(--dsh-text, inherit)',
};

/* ---------- entry ---------- */

export function apply(ctx) {
  const rpcCall = async (method, payload) => {
    const result = await ctx.connection.rpc.call('/api', 'turn-usage', { method, payload });
    if (!result?.ok) throw new Error(result?.error?.message || '无法读取每轮用量');
    return result.value;
  };

  ctx.inject(['betterSidebar'], scope => {
    scope.effect(() => scope.betterSidebar.registerTab({
      id: TAB_ID,
      title: '每轮用量',
      description: '每一轮请求的输入、缓存命中率、输出与时间',
      order: 31,
      single: true,
      component: props => h(TurnUsagePanel, {
        rpcCall,
        visible: props.visible !== false,
      }),
    }), 'turn-usage: sidebar tab');
  });
}

export { TurnUsagePanel };
