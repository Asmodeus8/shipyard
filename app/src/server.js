'use strict';

const { createApp } = require('./app');
const { loadTaskMetadata } = require('./metadata');

const port = Number(process.env.PORT || 8080);
const drainSeconds = Number(process.env.SHUTDOWN_DRAIN_SECONDS || 5);

const log = (entry) =>
  process.stdout.write(JSON.stringify({ time: new Date().toISOString(), ...entry }) + '\n');

async function main() {
  const task = await loadTaskMetadata();
  const server = createApp({
    version: process.env.APP_VERSION || 'dev',
    environment: process.env.APP_ENV || 'local',
    repositoryUrl: process.env.REPOSITORY_URL || null,
    task,
    log,
  });

  server.listen(port, () => log({ level: 'info', msg: 'listening', port, task }));

  const shutdown = (signal) => {
    log({ level: 'info', msg: 'shutdown_started', signal, drainSeconds });
    server.drain();
    setTimeout(() => {
      server.close(() => {
        log({ level: 'info', msg: 'shutdown_complete' });
        process.exit(0);
      });
      server.closeIdleConnections();
      setTimeout(() => process.exit(1), 10_000).unref();
    }, drainSeconds * 1000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('uncaughtException', (err) => {
  log({ level: 'fatal', msg: 'uncaught_exception', error: err.message, stack: err.stack });
  process.exit(1);
});

main();
