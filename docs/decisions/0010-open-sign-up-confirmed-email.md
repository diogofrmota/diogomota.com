# 0010 — Open sign-up, with the email confirmed after

**Decided:** sign-up open since v0.5; confirmation since v1.2.0.

**Why:** friends sign up from a link; a sign-up code would be one more thing to send. But an unconfirmed email could be someone else's, and get their password resets.

**What it is:** signing up logs straight in and sends a link; until it's opened the account works, a note says so, and resets don't go to that email. A new email only applies once its link is opened.

**Costs:** sign-up still tells whether a username or email is taken. Anyone can make an account (and use the TMDB token through Shows).
