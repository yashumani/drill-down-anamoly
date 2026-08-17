export type WorkspaceRoute = 'guided' | 'advanced' | 'public-demo' | 'quality';

const routeToHash: Record<WorkspaceRoute, string> = {
  guided: '#/quick',
  advanced: '#/analysis',
  'public-demo': '#/public',
  quality: '#/quality',
};

const hashToRoute = new Map(Object.entries(routeToHash).map(([route, hash]) => [hash, route as WorkspaceRoute]));

export function workspaceFromHash(hash = typeof window === 'undefined' ? '' : window.location.hash): WorkspaceRoute {
  const normalized = hash.split('?')[0].replace(/\/$/, '') || '#/quick';
  return hashToRoute.get(normalized) ?? 'guided';
}

export function hashForWorkspace(workspace: WorkspaceRoute) {
  return routeToHash[workspace];
}

export function writeWorkspaceHash(workspace: WorkspaceRoute) {
  if (typeof window === 'undefined') return;
  const target = hashForWorkspace(workspace);
  if (window.location.hash === target) return;
  window.history.pushState({ workspace }, '', target);
}
