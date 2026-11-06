'use strict';

(() => {
  const INTERVAL_MS = 1500;
  const WINDOW = 60;
  const STALE_MS = 30_000;
  const LOG_ROWS = 12;
  const PALETTE = ['#2dd4bf', '#818cf8', '#f472b6', '#fbbf24', '#38bdf8', '#a3e635', '#fb923c', '#c084fc'];

  const $ = (id) => document.getElementById(id);
  const probes = [];
  const tasks = new Map();
  let total = 0;
  let succeeded = 0;
  let baseline = null;
  let live = true;
  let timer = null;
  let repoUrl = null;

  const fmtMs = (v) => (v == null ? '—' : v < 10 ? `${v.toFixed(1)} ms` : `${Math.round(v)} ms`);
  const shortSha = (v) => (/^[0-9a-f]{12,}$/i.test(v) ? v.slice(0, 7) : v);
  const clock = (t) => new Date(t).toLocaleTimeString([], { hour12: false });

  function fmtUptime(s) {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s % 60}s`;
    return `${s}s`;
  }

  function percentile(values, p) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
  }

  function taskKey(info) {
    return info.task?.taskId || info.hostname;
  }

  function taskLabel(info) {
    const id = info.task?.taskId;
    return id ? id.slice(0, 8) : info.hostname;
  }

  async function probe() {
    const started = performance.now();
    const entry = { t: Date.now(), ok: false, status: 0, ms: null };
    try {
      const res = await fetch('/api/info', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
      entry.ms = performance.now() - started;
      entry.status = res.status;
      if (res.ok) {
        const info = await res.json();
        entry.ok = true;
        entry.info = info;
        record(info, entry);
      }
    } catch {
      entry.status = 0;
    }
    total += 1;
    if (entry.ok) succeeded += 1;
    probes.push(entry);
    if (probes.length > WINDOW) probes.shift();
    render(entry);
  }

  function record(info, entry) {
    const key = taskKey(info);
    let t = tasks.get(key);
    if (!t) {
      t = { key, label: taskLabel(info), count: 0, color: PALETTE[tasks.size % PALETTE.length] };
      tasks.set(key, t);
    }
    t.count += 1;
    t.lastSeen = entry.t;
    t.az = info.task?.availabilityZone || null;
    t.version = info.version;
    t.uptime = info.uptimeSeconds;
    entry.task = t;
    if (!baseline) baseline = info.version;
    repoUrl = info.repositoryUrl;
  }

  function render(latest) {
    renderStatus();
    renderStats(latest);
    renderRollout();
    renderChart();
    renderDistribution();
    if (latest) renderRow(latest);
  }

  function renderStatus() {
    const el = $('status');
    const recent = probes.slice(-10);
    const lastThree = probes.slice(-3);
    let state = 'ok', text = 'Operational';
    if (lastThree.length === 3 && lastThree.every((p) => !p.ok)) [state, text] = ['down', 'Unreachable'];
    else if (recent.some((p) => !p.ok)) [state, text] = ['degraded', 'Degraded'];
    if (!probes.length) [state, text] = ['pending', 'Connecting'];
    if (!live) text = `${text} · paused`;
    el.dataset.state = state;
    el.lastElementChild.textContent = text;
  }

  function renderStats(latest) {
    const info = latest?.info;
    if (info) {
      $('env').textContent = info.environment;
      const v = $('version');
      v.textContent = shortSha(info.version);
      v.title = info.version;
      if (repoUrl && /^[0-9a-f]{7,}$/i.test(info.version)) v.href = `${repoUrl}/commit/${info.version}`;
      else v.removeAttribute('href');
      $('started').textContent = `Task up ${fmtUptime(info.uptimeSeconds)}`;
      $('region').textContent = info.region || 'local';
      const rev = info.task?.revision ? ` · rev ${info.task.revision}` : '';
      $('platform').textContent = info.task?.platform === 'ecs-fargate' ? `ECS Fargate${rev}` : 'Local container';
      document.title = `${info.environment} · ${shortSha(info.version)} — Shipyard`;
    }

    const now = Date.now();
    const active = [...tasks.values()].filter((t) => now - t.lastSeen < STALE_MS);
    $('tasks').textContent = active.length;
    const azs = [...new Set(active.map((t) => t.az).filter(Boolean))].sort();
    $('azs').textContent = azs.length ? azs.join(' · ') : active.length ? 'Docker network' : '—';

    $('success').textContent = total ? `${((succeeded / total) * 100).toFixed(total === succeeded ? 0 : 1)}%` : '—';
    $('probes').textContent = `${total.toLocaleString()} probe${total === 1 ? '' : 's'}`;
  }

  function renderRollout() {
    const recent = probes.slice(-20).filter((p) => p.ok);
    const versions = [...new Set(recent.map((p) => p.info.version))];
    const banner = $('rollout');
    if (versions.length > 1) {
      const next = recent[recent.length - 1].info.version === baseline
        ? versions.find((v) => v !== baseline)
        : recent[recent.length - 1].info.version;
      const share = recent.filter((p) => p.info.version === next).length;
      $('rollout-text').textContent = `Rolling deployment in progress: ${shortSha(next)} served ${share} of the last ${recent.length} responses`;
      banner.hidden = false;
    } else {
      if (versions.length === 1 && versions[0] !== baseline) baseline = versions[0];
      banner.hidden = true;
    }
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const W = 600, H = 190, PAD_TOP = 14;

  function niceMax(v) {
    const steps = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
    return steps.find((s) => s >= v) || Math.ceil(v / 1000) * 1000;
  }

  function el(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }

  function renderChart() {
    const svg = $('chart-svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.replaceChildren();
    document.querySelectorAll('.chart-label').forEach((n) => n.remove());

    const values = probes.filter((p) => p.ok).map((p) => p.ms);
    const max = niceMax(Math.max(10, ...values) * 1.15);
    const x = (i) => (i / (WINDOW - 1)) * W;
    const y = (v) => H - (v / max) * (H - PAD_TOP);
    const offset = WINDOW - probes.length;

    for (const frac of [0, 0.5, 1]) {
      const yy = y(max * frac);
      svg.append(el('line', { x1: 0, x2: W, y1: yy, y2: yy, class: 'grid-line' }));
      const label = document.createElement('span');
      label.className = 'chart-label';
      label.style.top = `${(yy / H) * 100}%`;
      label.textContent = frac ? `${Math.round(max * frac)} ms` : '';
      $('chart').append(label);
    }

    const pts = probes
      .map((p, i) => (p.ok ? [x(i + offset), y(Math.min(p.ms, max))] : null))
      .filter(Boolean);
    if (pts.length > 1) {
      const line = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join('');
      svg.append(el('path', { d: `${line}L${pts.at(-1)[0]},${H}L${pts[0][0]},${H}Z`, class: 'area' }));
      svg.append(el('path', { d: line, class: 'line' }));
    }
    probes.forEach((p, i) => {
      if (!p.ok) svg.append(el('rect', { x: x(i + offset) - 2, y: H - 14, width: 4, height: 14, rx: 1, class: 'fail' }));
    });

    const p50 = percentile(values, 50), p95 = percentile(values, 95), p99 = percentile(values, 99);
    $('p50').textContent = fmtMs(p50);
    $('p95').textContent = fmtMs(p95);
    $('p99').textContent = fmtMs(p99);
  }

  function attachChartHover() {
    const chart = $('chart');
    const tip = $('chart-tip');
    chart.addEventListener('mousemove', (e) => {
      if (!probes.length) return;
      const rect = chart.getBoundingClientRect();
      const offset = WINDOW - probes.length;
      const i = Math.round(((e.clientX - rect.left) / rect.width) * (WINDOW - 1)) - offset;
      const p = probes[Math.max(0, Math.min(probes.length - 1, i))];
      const idx = probes.indexOf(p) + offset;
      const svg = $('chart-svg');
      svg.querySelector('.cursor')?.remove();
      const cx = (idx / (WINDOW - 1)) * W;
      svg.append(el('line', { x1: cx, x2: cx, y1: 0, y2: H, class: 'cursor' }));
      tip.hidden = false;
      tip.style.left = `${Math.min(Math.max((idx / (WINDOW - 1)) * rect.width, 70), rect.width - 70)}px`;
      tip.textContent = p.ok ? `${clock(p.t)} · ${fmtMs(p.ms)} · ${p.task.label}` : `${clock(p.t)} · failed (${p.status || 'timeout'})`;
    });
    chart.addEventListener('mouseleave', () => {
      tip.hidden = true;
      $('chart-svg').querySelector('.cursor')?.remove();
    });
  }

  function renderDistribution() {
    const list = $('dist');
    const all = [...tasks.values()].sort((a, b) => b.count - a.count);
    const sum = all.reduce((n, t) => n + t.count, 0);
    $('dist-empty').hidden = all.length > 0;
    $('dist-total').textContent = sum ? `${sum.toLocaleString()} responses` : '—';
    const now = Date.now();

    for (const t of all) {
      let li = list.querySelector(`[data-key="${CSS.escape(t.key)}"]`);
      if (!li) {
        li = document.createElement('li');
        li.dataset.key = t.key;
        li.style.setProperty('--c', t.color);
        li.innerHTML = '<div class="who"><i></i><span class="mono"></span><span class="meta"></span></div><span class="share"></span><div class="bar"><span></span></div>';
        li.querySelector('.who .mono').textContent = t.label;
        list.append(li);
      }
      const pct = sum ? (t.count / sum) * 100 : 0;
      li.querySelector('.meta').textContent = [t.az, shortSha(t.version)].filter(Boolean).join(' · ');
      li.querySelector('.share').textContent = `${pct.toFixed(0)}%`;
      li.querySelector('.bar span').style.width = `${pct}%`;
      li.classList.toggle('stale', now - t.lastSeen > STALE_MS);
    }
    const order = all.map((t) => t.key).join('|');
    if ([...list.children].map((n) => n.dataset.key).join('|') !== order) {
      all.forEach((t) => list.append(list.querySelector(`[data-key="${CSS.escape(t.key)}"]`)));
    }
  }

  function renderRow(p) {
    const row = $('row-tpl').content.firstElementChild.cloneNode(true);
    const set = (k, v) => (row.querySelector(`[data-k="${k}"]`).textContent = v);
    set('time', clock(p.t));
    set('task', p.task?.label || '—');
    set('az', p.task?.az || '—');
    set('status', p.status || 'ERR');
    set('ms', fmtMs(p.ms));
    set('version', p.info ? shortSha(p.info.version) : '—');
    if (p.task) row.querySelector('.task').style.setProperty('--c', p.task.color);
    else row.querySelector('.task i').style.background = 'var(--line-2)';
    if (!p.ok) row.querySelector('.code').dataset.bad = '';
    const body = $('log');
    body.prepend(row);
    while (body.children.length > LOG_ROWS) body.lastElementChild.remove();
  }

  function schedule() {
    clearTimeout(timer);
    if (live && !document.hidden) timer = setTimeout(async () => { await probe(); schedule(); }, INTERVAL_MS);
  }

  function setLive(next) {
    live = next;
    const btn = $('toggle');
    btn.setAttribute('aria-pressed', String(live));
    btn.lastElementChild.textContent = live ? 'Live' : 'Paused';
    renderStatus();
    if (live) probe().then(schedule);
    else clearTimeout(timer);
  }

  $('toggle').addEventListener('click', () => setLive(!live));
  document.addEventListener('visibilitychange', () => (document.hidden ? clearTimeout(timer) : live && schedule()));
  attachChartHover();
  render();
  probe().then(schedule);
})();
