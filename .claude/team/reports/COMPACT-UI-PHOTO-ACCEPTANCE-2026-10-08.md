# Compact shared UI and verified profile photo acceptance — 2026-10-08

Completed. The following entries retain intermediate checkpoints; final gates, actual photo/backup evidence and current recovery pointers are authoritative in [COMPACT-UI-PHOTO-RELEASE-2026-10-08.md](COMPACT-UI-PHOTO-RELEASE-2026-10-08.md).

Accepted scope: D81/T25 compact icon-only Markdown actions and matched finding text; D82/T26 available verified Google staff photos in shared/internal identity and new comments/replies. No new scopes, credentials, schema or attribution namespaces.

## Source and local acceptance

UI owner bfafd41, integrated b9d5668; photo owner9b68b27, integrated6c10b2d. Four UI files and eleven photo/config/docs files separately reviewed. T25 final24tests/4files/build PASS and lint PASS; independent30tests/source review PASS. Actual desktop1280 and mobile390 browser:180pxActions/140pxCertification, fouraligned controls, no pageoverflow, compact29.6pxicons, Copiedfeedback without row expansion, finding14px matches table14px and wraps. Browsererrors empty. Independent images PASS after containment/column corrections.

T26 owner54tests/7files lint/build/diffPASS, independent39tests/4files PASS. Fixed internal cookie auth response supplies an ID token verified for signature/audience/issuer/expiry/verified email/domain; internal identity also binds middleware user. Only approved photo URL is used. Incoming browser tokens/photos ignored. Staff names/IDs/reactions unchanged. Common avatar handles image errors and replacement URLs. Actual HTTP fixture covers no-store identity and root/reply snapshot, legacy named posts retain null photos.

Existing comments with no stored photo keep initials. Missing/expired photo credentials keep initials until normal session refresh. Actual fresh live staff sign-in: signature/audience/issuer/expiry/verified email/domain all verified, but Google ID token omits optional picture. Independently reviewed boolean-only temporary preload confirmed this and was removed immediately. Userinfo fallback using existing basic profile/email is now being implemented; live photo remains pending.

## Release gates

Combined full suite2183tests/227files, root lint/build PASS.02 and03 dry-run/actual PASS for b9d5668-dirty. Both pre-release19:23offsite objects downloaded/restored0warnings. VM baseline0040 integrity/FK/sequencesPASS, user data newer than prior release:13comments/4attachments/9reactions. Preserve exact fresh snapshot baseline.

Current0040 maintenance helper hash4df03a5eed6650fb18e0300f0bbea39cf72d4d1ed95d3671c826018e37326695; readonly0040 auditorf72cd8115651c8117f078a575df41ef36effc117085edbcac82e4e2242ee7464. CandidateCaddyhash205c68fc858aa233c003dea06c5f305a501a15fdbf32ee7189c7d230bfeab87f, validated with cached Caddy image/networknone. Active direct-OAuth auditor07ec623f139d6c110842693fdbb02ad3aaf1fbd7ec6bbf96025c3f296e48f4d8 independently passed valid/missing/duplicate/protected-unrelated fixtures.

Pre-cache candidate and current immutable image; snapshot all data/config with writers stopped. Inode-preserving overwrite and container-visible hash check, validate/reload Caddy and audit active direct/oauth2/* stripping BEFORE03 enables proxy token response. Full rollback restores old data/config/image and recreates non-token proxy before accepting old non-stripping edge. Final exact0040 counts/private-env/config/image audit, live UI/photo/header checks,04finaloffsite restore and07MCP required. No production test comments or comparisons.


Live UI actual viewport838/document823 contained, compact29.6pxMarkdown control with relative hidden-label containment, allfourActions same centerline, individualfinding14px/break-word. Independentlocal1280/390 acceptance remains valid. Currentlive manifest6548b941ec313feadc833b4fe1c9cb63490672e2dc7e1d899d28a5fff7eb1308; snapshot /var/backups/e3-tracking/pre-collaboration-0040-20261008T201530Z pins0152966 oldimage. Exactnewuserbaseline77findings/1genuineQA-report/59items/13comments/4attachments/9reactions retained. No production test posts/comparisons. Final photo/finaloffsite restore/MCP gates continue.


## Corrective photo candidate

Actual Google omission is addressed by accepted27072a3, integratedb2b31be. Sixfiles: fixed partial-fields Google Userinfo request after strict ID-token verification, same subject/verified email/Workspace domain binding, streamed8KiB limit/1500ms timeout/redirect rejection; tokens only from internal authenticated proxy response and never persisted/logged/returned. No new scopes or attribution changes. Proxy access-token response flag requires allthree public OAuth tokenheaders stripped before activation. Owner67tests8files/lint/build andindependent50tests4files/source/diffPASS. Requiredfinalfullsuite isrunning.

Expandededgeauditorecadc07a3080d5a26af942e375b4e8bd231dee74f79bd6b99740be1ac6bf76c9 independently22fixturesPASS. CandidateCaddy02d8b7b5286f784443513cc29a5b6ded76b76282feb3b2c84fb8b1a27ac4515e andactualcachedrunningCaddyimage isolatedvalidate/adaptPASS. Old singleAuthorization auditor07ec ishistorical. Freshoffsitepre-correction backups2026-10-08T20-47-08-630Z uploaded2/failures0 andbothdownloaded; sandboxcontains1genuinereport/59items/12comments, Airshoppen0reports/1comment. Actualrestorechecksawaitfullsuitecompletion. Realphoto stillpendingorderedrelease.