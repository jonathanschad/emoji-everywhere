# Privacy Policy — Emoji Everywhere

*Last updated: April 2, 2026*

## What data does this extension access?

- **Slack OAuth tokens**: When you connect a Slack workspace, the extension obtains an access token through Slack's OAuth 2.0 flow with PKCE. This token is used solely to fetch your workspace's custom emoji list.
- **Custom emoji data**: Emoji names and image URLs from connected Slack workspaces, and emoji images from imported ZIP files.
- **Tab URLs**: The extension reads the current tab's URL to determine whether emoji replacement is disabled on that site and to update the toolbar icon accordingly.
- **User preferences**: Your settings, such as enabled/disabled state, excluded domains, and optional Slack client ID override.

## Where is data stored?

All data is stored locally in your browser using the browser's built-in storage API (`browser.storage.local`). No data is transmitted to or stored on any external server operated by us.

## What external services does the extension communicate with?

The extension communicates only with Slack's APIs (`slack.com/api`) and Slack's image CDN (`emoji.slack-edge.com`) to authenticate your account and fetch custom emoji. These requests go directly from your browser to Slack — there is no intermediary server or proxy.

## What data is collected or shared?

None. The extension does not collect, transmit, or share any personal data, browsing history, analytics, or telemetry. There are no third-party trackers, advertising, or data-sharing partnerships.

## Data retention

All data remains in your browser's local storage until you remove a source, uninstall the extension, or clear your browser data. You can disconnect a Slack workspace or delete an imported ZIP source at any time from the extension's popup, which immediately removes all associated data.

## Contact

If you have questions about this privacy policy, you can open an issue at [https://github.com/jonathanschad/emoji-everywhere](https://github.com/jonathanschad/emoji-everywhere).
