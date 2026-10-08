# Shared Google authentication setup
User authorized separate project/client creation and acceptance of Google API Services User Data Policy on2026-10-08.
Project e3-tracking-public-auth (E3 Tracking Public Auth), same organization as staff project. User-configured billing is enabled; SDK follow-up confirmed billingEnabled=true. No agent billing changes.
External audience. App E3 Tracking Shared Portal; support/contact jan.pan@e3-services.com.
Web client E3 Tracking Shared Comments.
Public client ID: 1001419691959-vjn2nb335rn91u33gs1so12kj8mhau45.apps.googleusercontent.com
Authorized JavaScript origins: https://tracking.e3-services.com, http://localhost, http://localhost:3000, http://localhost:3010.
No redirect required for GIS JavaScript callback flow. App does not use a client secret. Generated secret was not saved, downloaded or printed; console owns credential management.
Audience Testing; basic openid/email/profile sign-in is exempt from test-user restrictions, the unverified warning and seven-day expiry per the primary Google source below. Publication is unnecessary for this scoped sign-in integration. No other Google API scopes requested.
Existing e3-tracking Internal staff project/client and billing unchanged.
Production config uses this client ID and the fixed public origin. Verification evidence and account limits are recorded below.

## Follow-up
User configured project billing after creation (2026-10-08); initial billingEnabled=false was creation-time evidence. No agent billing changes.
Google primary source https://support.google.com/cloud/answer/15549945?hl=en confirms Sign in with Google/basic openid/email/profile scopes are exempt from Testing test-user lists, unverified warning and seven-day expiry. No publication/extra scopes required for this basic sign-in integration. Actual browser evidence follows.

SDK follow-up confirms billingEnabled=true after user's configuration. Agents have made no billing changes.


## Accepted local integration
Actual Google browser flow on integrated source passed verified name/photo on root and reply, reaction ownership across reload, guest opt-out and draft preservation. Separate review66/8 and QA57/8 passed. T15 commit9d03407 accepted and merged. Workspace account used; no consumer Gmail account tested live. Basic-profile External configuration and staff Internal client remain separate.

## Live configuration checkpoint, 2026-10-08
The separate External public client is configured on the production VM with `E3_PUBLIC_ORIGIN=https://tracking.e3-services.com` and trusted Workspace-session reuse enabled. Existing Internal staff OAuth/secret remains intact. Live shared view resolved verified jan.pan from the existing Workspace session, and guest opt-out/name fields worked. Real explicit Google Ján Pan/profile-photo posting passed in the final local build. The production GIS button renders; completion of its embedded-browser popup was not observed, and consumer Gmail was not exercised. Do not describe those two unobserved flows as live passes.
