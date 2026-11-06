'use strict';

async function loadTaskMetadata(env = process.env, fetchImpl = fetch) {
  const base = env.ECS_CONTAINER_METADATA_URI_V4;
  if (!base) return { platform: 'local' };

  try {
    const res = await fetchImpl(`${base}/task`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { platform: 'ecs' };
    const task = await res.json();
    return {
      platform: 'ecs-fargate',
      taskId: String(task.TaskARN || '').split('/').pop() || null,
      cluster: String(task.Cluster || '').split('/').pop() || null,
      availabilityZone: task.AvailabilityZone || null,
      revision: task.Revision || null,
      launchType: task.LaunchType || null,
    };
  } catch {
    return { platform: 'ecs' };
  }
}

module.exports = { loadTaskMetadata };
