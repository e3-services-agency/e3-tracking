import {afterEach,describe,expect,it,vi} from 'vitest';
import {mcpConfig} from './mcpOAuth.service';
afterEach(()=>vi.unstubAllEnvs());
describe('fail-closed HTTPS MCP configuration',()=>{
 it('is disabled by default independently of browser OAuth settings',()=>{vi.stubEnv('E3_MCP_HTTP_ENABLED','');vi.stubEnv('E3_PUBLIC_ORIGIN','http://localhost:3000');expect(mcpConfig()).toBeNull();});
 it('requires canonical HTTPS origin, explicit Workspace domain and production proxy auth',()=>{vi.stubEnv('E3_MCP_HTTP_ENABLED','1');vi.stubEnv('WORKSPACE_DOMAIN','example.com');vi.stubEnv('AUTH_MODE','proxy');vi.stubEnv('NODE_ENV','production');for(const origin of ['http://example.com','https://example.com/','https://user:pass@example.com','https://example.com/path','https://example.com?x=1']){vi.stubEnv('E3_PUBLIC_ORIGIN',origin);expect(()=>mcpConfig()).toThrow();}vi.stubEnv('E3_PUBLIC_ORIGIN','https://example.com');expect(mcpConfig()).toEqual({origin:'https://example.com',resource:'https://example.com/mcp',domain:'example.com'});vi.stubEnv('AUTH_MODE','local');expect(()=>mcpConfig()).toThrow();vi.stubEnv('AUTH_MODE','proxy');vi.stubEnv('WORKSPACE_DOMAIN','*');expect(()=>mcpConfig()).toThrow();});
});
