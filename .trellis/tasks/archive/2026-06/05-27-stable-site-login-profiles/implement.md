# Stable Site Login Profiles Roadmap Plan

## Parent Task Role

This parent task owns the staged product direction and cross-phase constraints. Direct implementation should happen in child tasks unless a future change is purely roadmap maintenance.

## Current Child

Start with `05-27-mvp-stable-site-login-profiles`.

## Future Child Candidates

1. Credential refresh from stable profile
   - Re-read cookies from a stable profile without opening a new login window.
   - Rewrite the downloader credential snapshot when site rules pass.

2. Auth-required assisted refresh
   - Hook `auth_required` download failures.
   - Attempt one refresh from the stable profile.
   - Retry once if refreshed credentials pass validation.
   - Prompt manual login if refresh fails.

3. Site profile diagnostics and site-specific policies
   - Make it clearer whether a site has browser profile data, downloader credentials, or both.
   - Add site-specific policy hooks only when repeated evidence shows they are needed.

## Planning Gate

Before starting each child task:

- Re-check the backend site-session contract spec.
- Confirm the child has testable acceptance criteria.
- Keep boundaries compatible with the roadmap concepts: browser profile, downloader credential snapshot, clear/reset behavior, refresh extension point.
