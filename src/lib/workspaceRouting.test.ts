import { describe, expect, it } from 'vitest';
import { hashForWorkspace, workspaceFromHash } from './workspaceRouting';

describe('workspace routing', () => {
  it('maps stable deep-link hashes to workspaces', () => {
    expect(workspaceFromHash('#/quick')).toBe('guided');
    expect(workspaceFromHash('#/analysis')).toBe('advanced');
    expect(workspaceFromHash('#/public')).toBe('public-demo');
    expect(workspaceFromHash('#/quality')).toBe('quality');
  });

  it('falls back safely and emits canonical hashes', () => {
    expect(workspaceFromHash('#/unknown')).toBe('guided');
    expect(hashForWorkspace('advanced')).toBe('#/analysis');
  });
});
