import json
import sys

config = json.load(sys.stdin)

def objects(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from objects(child)
    elif isinstance(value, list):
        for child in value:
            yield from objects(child)

routes = [node for node in objects(config) if isinstance(node.get('match'), list) and any(isinstance(match, dict) and '/oauth2/*' in match.get('path', []) for match in node['match'])]
if len(routes) != 1:
    raise SystemExit('FAIL: direct OAuth route missing or ambiguous')
proxies = [node for node in objects(routes[0].get('handle', [])) if node.get('handler') == 'reverse_proxy' and any(up.get('dial') == 'oauth2-proxy:4180' for up in node.get('upstreams', []))]
if len(proxies) != 1:
    raise SystemExit('FAIL: direct OAuth proxy missing or ambiguous')
headers = proxies[0].get('headers', {})
required = {'authorization', 'x-auth-request-access-token', 'x-forwarded-access-token'}
request = {item.lower() for item in headers.get('request', {}).get('delete', [])}
response = {item.lower() for item in headers.get('response', {}).get('delete', [])}
if not required.issubset(request) or not required.issubset(response):
    raise SystemExit('FAIL: direct OAuth token-header protection absent')
for node in objects(config):
    if node.get('handler') != 'headers':
        continue
    for operation in ('set', 'add'):
        for destination, values in node.get('request', {}).get(operation, {}).items():
            if destination.lower() in required:
                raise SystemExit('FAIL: token header copied into upstream request')
            if isinstance(values, str):
                values = [values]
            if any(any(header in value.lower() for header in required) for value in values):
                raise SystemExit('FAIL: token header copied under another name')
print('PASS: active OAuth token-header stripping and no upstream token copying')
