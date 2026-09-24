import { describe, it, expect } from 'vitest';
import { resolveInitialProject } from './resolveInitialProject';

const projects = [
  { id: 'p1', key: 'project-a' },
  { id: 'p2', key: 'project-b' },
];

describe('resolveInitialProject', () => {
  it('URL key wins over a stored id for a different project', () => {
    expect(resolveInitialProject('project-b', 'p1', projects)).toEqual({
      type: 'select',
      projectId: 'p2',
      projectKey: 'project-b',
    });
  });

  it('URL key wins even when there is no stored id at all', () => {
    expect(resolveInitialProject('project-a', null, projects)).toEqual({
      type: 'select',
      projectId: 'p1',
      projectKey: 'project-a',
    });
  });

  it('unknown URL key clears the active project regardless of a valid stored id', () => {
    expect(resolveInitialProject('does-not-exist', 'p1', projects)).toEqual({ type: 'clear' });
  });

  it('falls back to the stored id only when the URL carries no project key', () => {
    expect(resolveInitialProject(null, 'p2', projects)).toEqual({
      type: 'select',
      projectId: 'p2',
      projectKey: 'project-b',
    });
  });

  it('clears when the URL has no key and the stored id no longer matches a project', () => {
    expect(resolveInitialProject(null, 'deleted-id', projects)).toEqual({ type: 'clear' });
  });

  it('does nothing when there is neither a URL key nor a stored id', () => {
    expect(resolveInitialProject(null, null, projects)).toEqual({ type: 'none' });
  });

  it('does nothing with an empty project list and no URL key or stored id', () => {
    expect(resolveInitialProject(null, null, [])).toEqual({ type: 'none' });
  });
});
