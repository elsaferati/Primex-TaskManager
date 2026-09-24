# Source collection

Intelligence keeps the collection code inside `app/intelligence`. Adding a LinkedIn source stores a personal profile (`/in/...`) or company page (`/company/...`) URL. A Celery Beat task runs every five minutes and starts a Bright Data Posts discovery job when the source's check interval has elapsed. Later ticks retrieve completed snapshots and store posts with direct LinkedIn post URLs. Repeated snapshots are deduplicated by post ID and URL.

Required server configuration:

- `BRIGHTDATA_API_TOKEN`: Bright Data API token with access to the LinkedIn Posts scraper. The deployment workflow reads it from a GitHub Actions secret of the same name. The token is never sent to the browser.
- `OPENAI_API_KEY`: already supported by the application; used to summarize and classify newly collected post text. If missing or analysis fails, the post is still stored with an extractive summary.

Optional server configuration:

- `BRIGHTDATA_LINKEDIN_POSTS_DATASET_ID`: defaults to Bright Data's LinkedIn Posts dataset ID used by this connector.
- `INTELLIGENCE_AI_MODEL`: defaults to `gpt-5.4-nano`.

The first LinkedIn check looks back 60 days. Scheduled checks overlap the previous check by one day so delayed posts can still be collected. An admin's **Check last 60 days** action reruns the longer window to backfill posts. Stored posts are deduplicated by their direct URL and provider ID. For personal profiles, discovery results are filtered by the post author's profile ID; the provider may also return posts by other people. Locale-specific LinkedIn post URLs are normalized to direct `www.linkedin.com/posts/...` links.

Admin users can start a check from **Intelligence → Sources**. A new active LinkedIn source starts a first check automatically when the provider token is configured. Results are asynchronous and normally appear after a later Beat tick. **Refresh feed** reloads posts already stored in the database; it does not start a new provider request.

The LinkedIn connector discovers provider-accessible public posts. It does not promise complete coverage of every LinkedIn post, and it does not monitor likes, comments, or private activity.

Four official website lists are collected directly on the server: KIESA News, KIESA Announcements, European Commission Digital Funding, and European Commission Digital News. The `website_adapter.py` connector accepts only these exact listing URLs and follows article links on the same official host. It reads the first page of each list hourly, imports recent articles and still-open funding calls, and stores direct item links. New items are analyzed with the existing server-side OpenAI configuration.

Public RSS and Atom feed URLs can be added by admins without a site-specific connector. The `rss_adapter.py` collector downloads at most 2 MB, follows at most three public redirects, reads up to 50 feed entries, and stores recent entries using their direct article links. It never downloads article pages from the feed. New active RSS sources start an asynchronous first check; later checks follow the configured interval (60 minutes by default) through Celery Beat. Private network addresses and nonstandard ports are rejected. Websites without an RSS or Atom feed still need a dedicated connector; Facebook, API, and Other remain configuration-only.

Reading status uses the existing `intelligence_user_states.read_at` column per user and item. The feed supports `read_state=unread|read|all`; opening a direct article or marking it read updates the status through the authenticated API. Marking an item unread clears only `read_at`, leaving any bookmark state intact.

Priority is calculated for each analyzed item. A normal-priority source needs importance >= 80 and relevance >= 70 for a High badge; High sources use 70/60 and Low sources use 90/80. The source setting therefore adjusts the threshold instead of marking every item High. If AI analysis is unavailable, the existing fallback scores are used.

Any authenticated user can email a collected update to the fixed internal address `180primex.eu@gmail.com` from the item card. The server builds the message from the stored title, summary, insight, structured opportunity details, and direct source URL, then uses the application's existing `GmailService` and `EMAIL_USER`/`EMAIL_PASSWORD` configuration. The recipient and content cannot be supplied by the browser. `intelligence_user_states.emailed_at` records a successful send per user and item; later clicks return the original send time without sending again. Demo items cannot be emailed.

Provider API references: [LinkedIn data collection](https://brightdata.com/solutions/data-collection/linkedin), [async trigger](https://docs.brightdata.com/api-reference/web-scraper-api/asynchronous-requests), [snapshot progress](https://docs.brightdata.com/api-reference/web-scraper-api/management-apis/monitor-progress).
