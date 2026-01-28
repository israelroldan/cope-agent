  ---
  Fly.io Deployment Guide

  Step 1: Install Fly CLI

  curl -L https://fly.io/install.sh | sh

  Step 2: Run Setup

  ./scripts/deploy.sh --setup

  This will:
  - Log you into Fly.io (opens browser)
  - Create the cope-agent app
  - Optionally create cope-slack-bot app
  - Show you the secrets you need to set

  Step 3: Set Secrets

  # Generate an API key
  API_KEY=$(openssl rand -hex 32)
  echo "Your COPE_API_KEY: $API_KEY"

  # Set secrets for HTTP server
  fly secrets set -a cope-agent \
    ANTHROPIC_API_KEY=your-anthropic-key \
    COPE_API_KEY=$API_KEY \
    SANITY_PROJECT_ID=your-project-id \
    SANITY_API_TOKEN=your-sanity-token \
    SANITY_DATASET=production

  Step 4: Deploy

  ./scripts/deploy.sh

  Your app will be live at: https://cope-agent.fly.dev

  Step 5: Test It

  # Health check (no auth needed)
  curl https://cope-agent.fly.dev/health

  # Create a timer (with auth)
  curl -X POST https://cope-agent.fly.dev/timer \
    -H "X-Api-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"label": "Test from Fly", "minutes": 1}'

  Timer should appear on your local menubar instantly!

  ---
  Auto-Deploy on Git Push

  Step 1: Create Fly API Token

  fly tokens create deploy -x 999999h

  Step 2: Add to GitHub Secrets

  1. Go to your repo → Settings → Secrets and variables → Actions
  2. Add secret: FLY_API_TOKEN = the token from step 1

  Step 3: Push to Deploy

  git add .
  git commit -m "Deploy to Fly.io"
  git push origin main

  GitHub Actions will automatically deploy on every push to main.

  ---
  Optional: Slack Bot

  # Set Slack bot secrets
  fly secrets set -a cope-slack-bot \
    ANTHROPIC_API_KEY=your-key \
    SLACK_BOT_TOKEN=xoxb-your-token \
    SLACK_APP_TOKEN=xapp-your-token \
    SANITY_PROJECT_ID=your-project \
    SANITY_API_TOKEN=your-token

  # Deploy Slack bot
  ./scripts/deploy.sh --slack

  ---
  Quick Reference
  ┌─────────────────────────────┬─────────────────────────┐
  │           Command           │       Description       │
  ├─────────────────────────────┼─────────────────────────┤
  │ ./scripts/deploy.sh --setup │ First-time setup        │
  ├─────────────────────────────┼─────────────────────────┤
  │ ./scripts/deploy.sh         │ Deploy HTTP server      │
  ├─────────────────────────────┼─────────────────────────┤
  │ ./scripts/deploy.sh --slack │ Deploy Slack bot        │
  ├─────────────────────────────┼─────────────────────────┤
  │ ./scripts/deploy.sh --all   │ Deploy both             │
  ├─────────────────────────────┼─────────────────────────┤
  │ fly logs                    │ View HTTP server logs   │
  ├─────────────────────────────┼─────────────────────────┤
  │ fly logs -a cope-slack-bot  │ View Slack bot logs     │
  ├─────────────────────────────┼─────────────────────────┤
  │ fly status                  │ Check app status        │
  ├─────────────────────────────┼─────────────────────────┤
  │ fly secrets list            │ List configured secrets │
  └─────────────────────────────┴─────────────────────────┘
  ---
  Files Created/Updated
  ┌──────────────────────────────┬──────────────────────────┐
  │             File             │         Purpose          │
  ├──────────────────────────────┼──────────────────────────┤
  │ fly.toml                     │ HTTP server config       │
  ├──────────────────────────────┼──────────────────────────┤
  │ fly.slack.toml               │ Slack bot config         │
  ├──────────────────────────────┼──────────────────────────┤
  │ Dockerfile                   │ HTTP server container    │
  ├──────────────────────────────┼──────────────────────────┤
  │ Dockerfile.slack             │ Slack bot container      │
  ├──────────────────────────────┼──────────────────────────┤
  │ .dockerignore                │ Exclude files from build │
  ├──────────────────────────────┼──────────────────────────┤
  │ .github/workflows/deploy.yml │ Auto-deploy on push      │
  ├──────────────────────────────┼──────────────────────────┤
  │ scripts/deploy.sh            │ Manual deploy script     │
  └──────────────────────────────┴──────────────────────────┘
  The docker-compose.yml and Caddyfile are still there if you ever want to self-host on a VPS instead.