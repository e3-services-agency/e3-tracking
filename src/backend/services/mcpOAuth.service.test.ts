import {afterEach,describe,expect,it,vi} from 'vitest';
import {CLAUDE_CALLBACK, mcpCallbackKind, mcpRedirectMatches, mcpConfig} from './mcpOAuth.service';
afterEach(()=>vi.unstubAllEnvs());
describe('fail-closed HTTPS MCP configuration',()=>{
 it('is disabled by default independently of browser OAuth settings',()=>{vi.stubEnv('E3_MCP_HTTP_ENABLED','');vi.stubEnv('E3_PUBLIC_ORIGIN','http://localhost:3000');expect(mcpConfig()).toBeNull();});
 it('requires canonical HTTPS origin, explicit Workspace domain and production proxy auth',()=>{vi.stubEnv('E3_MCP_HTTP_ENABLED','1');vi.stubEnv('WORKSPACE_DOMAIN','example.com');vi.stubEnv('AUTH_MODE','proxy');vi.stubEnv('NODE_ENV','production');for(const origin of ['http://example.com','https://example.com/','https://user:pass@example.com','https://example.com/path','https://example.com?x=1']){vi.stubEnv('E3_PUBLIC_ORIGIN',origin);expect(()=>mcpConfig()).toThrow();}vi.stubEnv('E3_PUBLIC_ORIGIN','https://example.com');expect(mcpConfig()).toEqual({origin:'https://example.com',resource:'https://example.com/mcp',domain:'example.com'});vi.stubEnv('AUTH_MODE','local');expect(()=>mcpConfig()).toThrow();vi.stubEnv('AUTH_MODE','proxy');vi.stubEnv('WORKSPACE_DOMAIN','*');expect(()=>mcpConfig()).toThrow();});
});


describe('strict MCP callback policy', () => {
    it.each([
        CLAUDE_CALLBACK,
        'http://127.0.0.1/callback',
        'http://127.0.0.1:1/callback',
        'http://127.0.0.1:65535/callback',
        'http://127.0.0.1:50972/callback/8O2bl7JfP_KJ',
    ])('accepts supported callback %s', uri => {
        expect(mcpCallbackKind(uri)).toBe(uri === CLAUDE_CALLBACK ? 'claude' : 'codex');
    });
    it.each([
        'http://localhost/callback', 'http://[::1]/callback', 'https://127.0.0.1/callback',
        'http://127.0.0.2/callback', 'http://127.1/callback', 'http://2130706433/callback',
        'http://0x7f000001/callback', 'http://127.000.000.001/callback',
        'http://127.0.0.1.evil.example/callback', 'http://127.0.0.1@evil.example/callback',
        'http://evil.example@127.0.0.1/callback', 'http://user:pass@127.0.0.1/callback',
        'http://127.0.0.1:0/callback', 'http://127.0.0.1:65536/callback',
        'http://127.0.0.1:080/callback', 'http://127.0.0.1:/callback',
        'http://127.0.0.1/callback/', 'http://127.0.0.1/callback/a/b',
        'http://127.0.0.1/callback/../callback', 'http://127.0.0.1/other/../callback',
        'http://127.0.0.1/%63allback', 'http://127.0.0.1/callback/%61',
        'http://127.0.0.1/callback/a%2fb', 'http://127.0.0.1/callback/a.b',
        'http://127.0.0.1/callback/' + 'x'.repeat(129),
        'http://127.0.0.1/callback?x=1', 'http://127.0.0.1/callback?',
        'http://127.0.0.1/callback#x', 'http://127.0.0.1/callback#',
        ' http://127.0.0.1/callback', 'http://127.0.0.1/callback\n',
        'HTTP://127.0.0.1/callback',
        CLAUDE_CALLBACK + '/', CLAUDE_CALLBACK + '?x=1', CLAUDE_CALLBACK + '#x',
        'https://claude.ai.evil.example/api/mcp/auth_callback',
        'https://chatgpt.com/connector_platform_oauth_redirect',
    ])('rejects unsupported or normalized callback %s', uri => {
        expect(mcpCallbackKind(uri)).toBeNull();
        expect(mcpRedirectMatches(uri, uri)).toBe(false);
    });
    it('relaxes only the Codex port, preserving registered host and exact callback ID', () => {
        const registered = 'http://127.0.0.1/callback/8O2bl7JfP_KJ';
        expect(mcpRedirectMatches('http://127.0.0.1:50972/callback/8O2bl7JfP_KJ', registered)).toBe(true);
        expect(mcpRedirectMatches('http://127.0.0.1:50973/callback/8O2bl7JfP_KJ', registered)).toBe(true);
        for (const uri of [CLAUDE_CALLBACK, 'http://127.0.0.1:50972/callback', 'http://127.0.0.1:50972/callback/other'])
            expect(mcpRedirectMatches(uri, registered)).toBe(false);
        expect(mcpRedirectMatches(CLAUDE_CALLBACK, CLAUDE_CALLBACK)).toBe(true);
    });
});
