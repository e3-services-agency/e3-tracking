/**
 * `list_projects` (T-2-10, plan MCP table): projects grouped by client, `[{client, projects:
 * [{key, name}]}]`. No `project_key` input -- this is how an agent discovers the key to pass to
 * every other tool.
 */
import * as ProjectDAL from '../../backend/dal/project.dal';

export interface ListProjectsGroup {
  client: string;
  projects: { key: string; name: string }[];
}

export async function listProjects(): Promise<ListProjectsGroup[]> {
  const projects = ProjectDAL.listProjects();
  const byClient = new Map<string, ListProjectsGroup>();
  for (const project of projects) {
    const clientName = project.client?.name ?? project.client_name ?? '(no client)';
    let group = byClient.get(clientName);
    if (!group) {
      group = { client: clientName, projects: [] };
      byClient.set(clientName, group);
    }
    group.projects.push({ key: project.key, name: project.name });
  }
  return [...byClient.values()];
}
