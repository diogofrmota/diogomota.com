# 0016 — The front page is a website; /about joins it

**Decided:** unreleased (after v1.2.0), 2026-11-16. Changes [0014](0014-home-is-the-apps.md) for logged-out visitors only: logged in, home is still the apps.

**Why:** People reach `diogomota.com` from a link on LinkedIn, logged out, and didn't know what they were looking at: a headline, Log in and Sign up, two cards and the apps' tab bar, which is an app's way of moving around, not a website's. `/about` was a black page in a monospace font with one button, in a look of its own. A visitor needs a page that says what the site is, shows the apps, and answers the obvious questions, with the header and footer every website has.

**What it is:**

- Logged out, `/` is the website's front page (`components/site/FrontPage`), in the website's frame (`components/site/SiteFrame`): a header (the `>_` mark and diogomota, home; Apps, a menu of them; How it works; About; Log in plain and Sign up filled; on a phone, Sign up and a menu with the rest), and a footer of links (the apps, the site's pages, the account; the year and the version). The page: the headline (`siteTagline`), a line built from each app's `summary`, Sign up and See the apps, and the apps in browser windows (`AppWindow`, each app's `AppPreview` scaled with the window); a section per app (its `tagline` and `features`, and Open, its login prompt); How it works; Questions; Sign up once more.
- The frame is the apps' parts on the apps' scales (the shell's tokens, `ui.module.css`) and the theme given: Light logged out, the user's own logged in. No new colors, no new font.
- `/about` is in the same frame: the initials, the name, the work and the city; what the site is, with a link to each app; Get in touch (`CONTACT_EMAIL`, when it's set). No See the apps. IBM Plex Mono is gone from the site (its files too), and so is the black.
- `/privacy`, logged out, is in the website's frame too; logged in, it stays in the apps' frame, as `/account` is.
- Logged in, nothing moves: home's heading is now Home, over the icons, with the tab bar.
- The link previews (`opengraph-image.tsx`, home's and `/about`'s) are drawn as the website is: the mark and diogomota, then the headline (or the name and work), on the Light theme's gray. The site's description is `siteTagline` with the apps' names.

**Costs:** two frames to keep in step, the website's and the apps'; the login pages stay in the apps' (with their tab bar), so Log in leaves the website's header for it. The front page says more, so it has more to keep true: its questions (privacy, offline, Download my data) and How it works describe the apps and must change when they do. A new app needs a `summary` and a `tagline` as well as its `features`.

**Update, 2026-11-21:** the apps' sections (each in a browser window, with its `tagline` and `features`) became three groups of small icons, For Couples (Calendar, Recipes), Trackers (Shows, Books) and Health (Fitness), each with two or three lines, so the page shows every app at a glance instead of five long sections; `AppWindow`, `tagline` and `features` are gone, and a new app needs its place in a group (`components/site/AppSections.tsx`). Questions became How to add to Home Screen, a slide a step in Safari on an iPhone, since adding the site to the Home Screen is what makes it feel like an app and isn't obvious on iOS. The phone's menu lists the site's links before the apps.
