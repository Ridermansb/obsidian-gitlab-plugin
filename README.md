# Embed GitLab Plugin for Obsidian 

An Obsidian plugin that embeds GitLab resources (issues, merge requests,
projects, and more) directly into your notes for quick reference and better
context.

<img width="717" height="115" alt="Screenshot from 2026-02-04 23-50-52" src="https://github.com/user-attachments/assets/a20db904-222b-4fc8-af49-13fa8cc57348" />

## Getting Started

1. Install the **Obsidian GitLab Embeds** plugin.
2. Paste a supported GitLab URL (issue, merge request, repository, etc.) into a note.
3. Switch to preview mode to see the embed rendered.

## Authentication

Public GitLab resources work without authentication. For private projects,
configure one of the following in **Settings → GitLab Embeds**:

### Personal access token (recommended)

1. Go to your GitLab instance → **Preferences → Access Tokens**.
2. Create a token with the **read_api** scope (or **api**).
3. Paste the token into the plugin settings for the matching instance.
4. Click **Test** to verify the connection.

Tokens are stored in Obsidian's secret storage, not in plain settings.

### OAuth (optional)

Configure a GitLab OAuth application with redirect URI `obsidian://gitlab-embeds`,
then enter the Client ID (and Client Secret if required) and click **Authorize**.
If both a PAT and OAuth are configured, the PAT is used first.

## Disclaimer

This plugin makes network requests to configured GitLab instances (e.g.
gitlab.com or self-hosted servers) in order to fetch and display embeds.

## Contribute

Contributions are welcome!  

- Feel free to open issues for bugs, feature requests, or improvements.  
- Submit pull requests if you want to add features or fix issues.  
- Make sure to follow the existing code style and test your changes in Obsidian.

### Local Setup

To develop and test the plugin locally:

1. **Clone the repository**
   ```bash
   git clone https://github.com/oliviergoulet5/obsidian-gitlab-plugin.git
   cd obsidian-gitlab-plugin
   ```
2. **Install dependencies**
    ```
    npm ci
    ```
3. **Make changes**\
    Write your feature or bug fix.
4. **Build the plugin**
    ```
    npm run build
    ```
5. **Link to your Obsidian vault**\
    Copy the `main.js`, `manifest.json`, and `styles.css` (if present) to your
    vault’s plugin folder:
    ```
    <your-vault>/.obsidian/plugins/obsidian-gitlab-embeds/
    ```

    Alternatively, you can make this automatic by either cloning into the
    plugins directory, or by creating a symlink. This should be more convenient.
6. **Toggle to enable the plugin**\
    Open `Obsidian` →  `Settings` →  `Community Plugins` →  `Enable Obsidian GitLab Embeds`.

