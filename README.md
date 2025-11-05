# GitHub RSS Generator

🚀 A modern web application that generates RSS feeds for GitHub repositories, including Issues, Pull Requests, Discussions, and Releases.

## Features

- 🔍 Search for any GitHub repository by URL
- 🤖 Automated RSS feed generation
- 🗃️ MongoDB integration for metadata storage

## Tech Stack

- **Framework**: MeteorJS 3.3.2
- **Frontend**: React 18.2.0 + TypeScript
- **Database**: MongoDB
- **API**: GitHub REST API
- **Styling**: CSS-in-JS

## Quick Start

### Prerequisites

- Node.js 18+
- Meteor.js (`npm install -g meteor`)
- GitHub Personal Access Token (optional but recommended)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/italojs/github-rss.git
   cd github-rss
   ```

2. **Install dependencies**
   ```bash
   meteor npm install
   ```

3. **Configure GitHub Token** (optional)
   - Get a token from [GitHub Settings](https://github.com/settings/tokens)
   - Add it to `server/main.ts` or use environment variables

4. **Start the application**
   ```bash
   meteor run
   ```

5. **Open browser**
   ```
   http://localhost:3000
   ```

## Usage

1. Enter a GitHub repository URL
2. Click "Search" to check for existing feeds
3. Generate RSS feeds if they don't exist
4. Access feeds at: `http://localhost:3000/rss/owner-repo/type.xml`

## Project Structure

```
├── client/                 # Client entry point
├── imports/
│   ├── api/               # Backend logic
│   └── ui/                # React components
├── server/                # Server entry point
├── public/rss/           # Generated RSS files
└── package.json          # Dependencies
```

