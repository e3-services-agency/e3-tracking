/**
 * MCP tool error (T-2-10, plan "MCP server"): a project that neither resolves from `project_key`
 * nor from `E3_PROJECT_KEY` is an MCP tool error with code `PROJECT_NOT_FOUND` (plan's exact
 * wording). Every other backend error (`NotFoundError`, `BadRequestError`, ...) is caught and
 * reported the same way by the tool wrapper in `registerTools.ts` -- `code` mirrors the existing
 * REST error codes (`src/backend/errors.ts`) so an agent that already knows the HTTP API's codes
 * recognises these too.
 */
export class McpToolError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'McpToolError';
  }
}

export class ProjectNotFoundError extends McpToolError {
  constructor(message: string) {
    super('PROJECT_NOT_FOUND', message);
    this.name = 'ProjectNotFoundError';
  }
}
