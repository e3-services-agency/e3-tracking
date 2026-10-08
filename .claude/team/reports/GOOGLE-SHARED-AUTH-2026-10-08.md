# Shared Google authentication setup
User authorized separate project/client creation and acceptance of Google API Services User Data Policy on2026-10-08.
Project e3-tracking-public-auth (E3 Tracking Public Auth), same organization as staff project. SDK confirms billingEnabled false.
External audience. App E3 Tracking Shared Portal; support/contact jan.pan@e3-services.com.
Web client E3 Tracking Shared Comments.
Public client ID: 1001419691959-vjn2nb335rn91u33gs1so12kj8mhau45.apps.googleusercontent.com
Authorized JavaScript origins: https://tracking.e3-services.com, http://localhost, http://localhost:3000, http://localhost:3010.
No redirect required for GIS JavaScript callback flow. App does not use a client secret. Generated secret was not saved, downloaded or printed; console owns credential management.
Audience currently Testing; public basic-profile scope exemption under verification, Publish disabled until branding complete. No other Google API scopes requested.
Existing e3-tracking Internal staff project/client and billing unchanged.
Integration config will use client ID and fixed public origin; local verification and actual browser Google flow are separate gates.

## Follow-up
User configured project billing after creation (2026-10-08); initial billingEnabled=false was creation-time evidence. No agent billing changes.
Google primary source https://support.google.com/cloud/answer/15549945?hl=en confirms Sign in with Google/basic openid/email/profile scopes are exempt from Testing test-user lists, unverified warning and seven-day expiry. No publication/extra scopes required for this basic sign-in integration. Actual browser token/session flow still to verify.

SDK follow-up confirms billingEnabled=true after user's configuration. Agents have made no billing changes.

