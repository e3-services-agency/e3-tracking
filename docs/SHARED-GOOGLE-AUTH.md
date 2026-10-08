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

Staff session reuse calls only the fixed internal oauth2-proxy endpoint with selected staff cookies; supplied identity headers and URLs are ignored. Only authenticated 202 responses matching WORKSPACE_DOMAIN count. Actual name/photo is used if supplied by the trusted profile endpoint; otherwise the email local part and initials provide a fallback without publishing the email. oauth2-proxy 7.6 normally exposes no profile picture. Google GIS supplies the full Google profile when the user selects it.

Tests inject a verifier and proxy responses, requiring no remote service. Record real Google button/consent and staff-cookie smoke separately after deployment; passing fixtures does not prove console configuration.

Sources: [Google setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [Google token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [Google automatic sign-in](https://developers.google.com/identity/gsi/web/guides/automatic-sign-in-sign-out), [oauth2-proxy 7.6 endpoints](https://oauth2-proxy.github.io/oauth2-proxy/7.6.x/features/endpoints/).
