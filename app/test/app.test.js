'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { loadTaskMetadata } = require('../src/metadata');

async function withServer(options, fn) {
  const logs = [];
  const server = createApp({ ...options, log: (e) => logs.push(e) });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base, server, logs);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET / serves the console with security headers', async () => {
  await withServer({}, async (base) => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.match(await res.text(), /<title>Shipyard Console<\/title>/);
  });
});

test('static assets are served with cache headers', async () => {
  await withServer({}, async (base) => {
    for (const [file, type] of [['/console.js', /javascript/], ['/styles.css', /css/], ['/favicon.svg', /svg/]]) {
      const res = await fetch(base + file);
      assert.equal(res.status, 200, file);
      assert.match(res.headers.get('content-type'), type);
      assert.match(res.headers.get('cache-control'), /max-age/);
    }
  });
});

test('GET /api/version reports the release', async () => {
  await withServer({ version: 'abc123', environment: 'test' }, async (base) => {
    const res = await fetch(`${base}/api/version`);
    assert.deepEqual(await res.json(), { version: 'abc123', environment: 'test' });
  });
});

test('GET /api/info returns runtime details and request counters', async () => {
  const task = { platform: 'ecs-fargate', taskId: 't-1', availabilityZone: 'eu-west-1a' };
  await withServer({ version: 'v1', task }, async (base) => {
    await fetch(`${base}/healthz`);
    await fetch(`${base}/missing`);
    const body = await (await fetch(`${base}/api/info`)).json();
    assert.equal(body.version, 'v1');
    assert.deepEqual(body.task, task);
    assert.equal(typeof body.uptimeSeconds, 'number');
    assert.equal(body.requests['2xx'], 1);
    assert.equal(body.requests['4xx'], 1);
  });
});

test('GET /healthz is ok, then 503 while draining', async () => {
  await withServer({}, async (base, server) => {
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    server.drain();
    const res = await fetch(`${base}/healthz`);
    assert.equal(res.status, 503);
    assert.equal((await res.json()).status, 'draining');
  });
});

test('unknown path is 404, wrong method is 405', async () => {
  await withServer({}, async (base) => {
    assert.equal((await fetch(`${base}/nope`)).status, 404);
    assert.equal((await fetch(`${base}/healthz`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${base}/`, { method: 'DELETE' })).status, 405);
  });
});

test('each request emits one structured log line', async () => {
  await withServer({}, async (base, _server, logs) => {
    await fetch(`${base}/healthz?probe=1`);
    await new Promise((r) => setImmediate(r));
    const entries = logs.filter((l) => l.msg === 'request');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].path, '/healthz');
    assert.equal(entries[0].status, 200);
    assert.ok(entries[0].durationMs >= 0);
  });
});

test('task metadata is read from the ECS endpoint', async () => {
  const fakeFetch = async (url) => {
    assert.equal(url, 'http://meta/task');
    return {
      ok: true,
      json: async () => ({
        TaskARN: 'arn:aws:ecs:eu-west-1:123:task/shipyard-prod/abc123',
        Cluster: 'arn:aws:ecs:eu-west-1:123:cluster/shipyard-prod',
        AvailabilityZone: 'eu-west-1b',
        Revision: '7',
        LaunchType: 'FARGATE',
      }),
    };
  };
  const meta = await loadTaskMetadata({ ECS_CONTAINER_METADATA_URI_V4: 'http://meta' }, fakeFetch);
  assert.deepEqual(meta, {
    platform: 'ecs-fargate',
    taskId: 'abc123',
    cluster: 'shipyard-prod',
    availabilityZone: 'eu-west-1b',
    revision: '7',
    launchType: 'FARGATE',
  });
  assert.deepEqual(await loadTaskMetadata({}), { platform: 'local' });
});
