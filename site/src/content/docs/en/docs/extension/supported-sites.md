---
title: Supported Sites
description: Understand Ameow's current major site coverage and how to judge whether a page is a good download target.
---

Ameow keeps expanding web-media download coverage, but it does not promise that every site and every page shape will work. Third-party sites frequently change their page structure, playback APIs, login rules, and rate limits, so "supported site" always needs to be judged together with the exact page you are using.

## Current focus sites

The public docs currently call out:

- YouTube
- Bilibili
- X / Twitter
- Douyin
- Xiaohongshu

Some releases may also include improvements for Pinterest, Instagram, Zhihu, or similar sites and page types. Check [Release Notes](../../releases/) for the latest behavior changes.

## Why does the same site sometimes work and sometimes fail?

Even when a site is within the current support range, these cases can still fail:

- the content requires login;
- the content is paid, age-restricted, region-restricted, or private;
- the page URL is no longer valid;
- the site recently changed and the current version has not caught up;
- the browser extension is not connected to the desktop app;
- you are still on a listing page, homepage, recommendation page, or redirect page instead of the actual content page.

## How do I judge whether a page is a good download target?

Check in this order:

1. the page opens normally in the browser;
2. the content fully plays or displays;
3. if login is required, you are already logged in;
4. the extension popup shows `Connected`;
5. you are sending the specific content page, not search results, a homepage, a recommendation feed, or a collection page.

If all of these are true and the task still fails, the next suspects are site changes or lack of support for that exact page shape.

## Use the extension and popup on the actual content page first

Both in-page download entries and the popup's "current page media" list work best on the actual content page:

- YouTube: the video page, not the homepage, subscriptions feed, or search results;
- Bilibili: the actual video or episode page, not a zone page, search page, or profile page;
- X / Twitter: the tweet detail page, not a mixed timeline;
- Pinterest, Instagram, and other feed-heavy sites: the actual Pin, post, or reel detail page, not the home feed.

List and recommendation pages often request several media resources at once: preview streams, cover images, neighbor cards, and side recommendations. The popup can only report what the current page is loading. It cannot assume only one of those requests is the target you meant.

If the popup resource list looks wrong, refresh is not the first move. Enter the actual content page first and retry.

## What should I try when a page fails?

Try in this order:

1. copy the page URL and paste it into Ameow;
2. send the task from the browser extension on the page;
3. reopen the page and try again;
4. switch to a steadier download-quality preference;
5. update to the latest stable release.

If the content needs login state, sending it through the extension is more reliable than copying only the link.
