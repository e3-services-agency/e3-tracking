# Google identity for shared commenters

Shared links still determine read/comment access. Google sign-in identifies a commenter; it never provides staff access or expands a share link's permissions. Staff OAuth remains Internal.

## Separate External client

Create/select the approved dedicated public-auth GCP project, configure Google Auth Platform Branding and External Audience, and create a Web application client. Use only the basic openid/email/profile identity data. Add Authorized JavaScript origins:

- https://tracking.e3-services.com
- http://localhost
- http://localhost:3000 (adjust to the actual preview port)

The GIS JavaScript callback flow needs the public client ID only. Do not put a client secret in the frontend. No redirect URI is needed for this flow; the staff redirect /oauth2/callback remains on the existing Internal client. Set branding/support details and required privacy/homepage links in the console; verification requirements depend on the final branding/audience settings.

## App and VM configuration

In local runtime environment or VM /opt/e3-tracking/.env set:

```
GOOGLE_COMMENT_CLIENT_ID=<External web client ID>
E3_PUBLIC_ORIGIN=https://tracking.e3-services.com
COMMENT_STAFF_SESSION=1
WORKSPACE_DOMAIN=e3-services.com
```

For local development use E3_PUBLIC_ORIGIN=http://localhost:3000 and COMMENT_STAFF_SESSION=0. The API origin setting must match the frontend browser origin, not the API's internal port. docker-compose passes these values into the app; rebuild the reviewed image and recreate the app after editing the VM env. Existing deployment scripts preserve VM environment values: add these entries explicitly during upgrades. Keep the normal dry-run, backup, reviewed-image deployment and rollback checks.

Sign-in uses Google's current https://accounts.google.com/gsi/client library. One Tap/auto-selection works only when eligible (Google session, prior consent, browser conditions); otherwise the explicit Google button remains. Browser profile inspection is not available. Script/network failure leaves guest commenting available. Choosing Use guest identity signs out only of shared commenter identity and prevents automatic staff-session reuse/Google auto-selection; staff portal login remains intact.

## Verification and privacy

The backend verifies Google's signature, audience, issuer, expiry and one-use nonce, then issues an opaque HttpOnly SameSite=Lax cookie (Secure in production). Database stores a hash of the cookie, profile name, an approved HTTPS Google profile-photo URL and session expiry, never an ID/access/refresh token or public email. Login/logout require an exact configured Origin and server challenge cookie/body match. Shared verified mutations also check Origin. Challenges are scoped to the current share token and expire after five minutes; commenter sessions expire after 24 hours. Rotated/revoked shares still fail independently of identity. These operational session/challenge tables are not project backup payloads.

Staff identity verification calls only the fixed internal oauth2-proxy endpoint with selected staff cookies; optional photo enrichment then calls the fixed Google Userinfo endpoint as described below; supplied identity headers and URLs are ignored. Only authenticated 202 responses matching WORKSPACE_DOMAIN count. The existing staff display name and participant ID remain unchanged. Photo enrichment verifies the ID token from that authenticated proxy response against the staff client and matching email/domain; absent or invalid photo credentials retain initials. oauth2-proxy 7.6 userinfo does not expose a picture, so it is not used for profile enrichment. Google GIS remains the separate public commenter identity path.

Tests inject a verifier and proxy responses, requiring no remote service. Record real Google button/consent and staff-cookie smoke separately after deployment; passing fixtures does not prove console configuration.

Sources: [Google setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [Google token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [Google automatic sign-in](https://developers.google.com/identity/gsi/web/guides/automatic-sign-in-sign-out), [oauth2-proxy 7.6 endpoints](https://oauth2-proxy.github.io/oauth2-proxy/7.6.x/features/endpoints/).


## Staff profile photos

The app receives `GOOGLE_STAFF_CLIENT_ID` from the existing non-secret `OAUTH2_CLIENT_ID` through Compose. The proxy returns its staff ID token only to the app's fixed internal `/oauth2/auth` request; Caddy strips Authorization, X-Auth-Request-Access-Token and X-Forwarded-Access-Token on the public OAuth route in both directions. No new Google scope is required: the Google provider already requests `profile email`.

A photo is used only after Google signature, issuer, expiry, staff audience, verified email and Workspace domain checks, with the email bound to the authenticated proxy session (and to the middleware user for internal comments). Staff names, participant IDs and reaction ownership remain unchanged. ID/access tokens stay in memory and are never returned to the browser, logged or backed up. Missing or expired profile credentials retain initials until the normal staff session refresh/sign-in provides a valid token. Unavailable or failed photo downloads also retain initials; a replacement photo URL is tried automatically.

New staff comments and replies snapshot the verified photo when available. Existing comments with no stored photo continue to show initials; historical attribution is not rewritten.


Deployment order for an existing VM: first take the approved complete data/config snapshot. Install the reviewed Caddyfile, validate it with Caddy and explicitly reload the running Caddy configuration before enabling/recreating oauth2-proxy with `OAUTH2_PROXY_SET_AUTHORIZATION_HEADER=true` and `OAUTH2_PROXY_PASS_ACCESS_TOKEN=true`. The reviewed edge configuration strips Authorization, X-Auth-Request-Access-Token and X-Forwarded-Access-Token on the public OAuth route in both directions. A bind-mounted file replacement does not itself reload Caddy. Only then run the normal deployment with the new Compose configuration. Verify the public OAuth response never includes Authorization, X-Auth-Request-Access-Token or X-Forwarded-Access-Token. This order prevents a temporary ID-token response-header exposure while the old edge configuration is still active. Rollback restores the saved configuration together with the pinned release image.


The live Google staff ID token can omit its optional picture claim even after fresh sign-in. When the validated token has no safe photo, the app uses the access token from that same fixed internal authenticated proxy response to request only `id,email,verified_email,hd,picture` at `https://www.googleapis.com/oauth2/v2/userinfo`. This uses the existing basic profile/email permissions. Browser-supplied access-token headers are ignored. The Google request uses a server-side Authorization header, no cookies or query token, rejects redirects, times out after 1.5 seconds and caps streamed JSON at 8 KiB. Its subject ID, verified email and hosted domain must match the validated staff token/session before accepting a safe photo. Missing credentials, mismatches, failure or a withheld photo retain initials; staff identity and login remain unchanged. No credential is stored in the database or backup. Caddy must be validated and reloaded with all three token-header removals before enabling the proxy access-token response header.
