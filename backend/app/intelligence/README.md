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

Four official website lists are collected directly on the server: KIESA News, KIESA Announcements, European Commission Digital Funding, and European Commission Digital News. The `website_adapter.py` connector accepts only these exact listing URLs and follows article links on the same official host. It reads the first page of each list hourly, imports recent articles and still-open funding calls, and stores direct item links. New items are analyzed with the existing server-side OpenAI configuration. Other Website, RSS, Facebook, API, and Other source URLs remain configuration-only until their connectors are added.

Provider API references: [LinkedIn data collection](https://brightdata.com/solutions/data-collection/linkedin), [async trigger](https://docs.brightdata.com/api-reference/web-scraper-api/asynchronous-requests), [snapshot progress](https://docs.brightdata.com/api-reference/web-scraper-api/management-apis/monitor-progress).
