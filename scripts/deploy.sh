#!/bin/bash
#
# COPE Agent Deployment Script (Fly.io)
#
# Usage:
#   ./scripts/deploy.sh              # Deploy HTTP server
#   ./scripts/deploy.sh --slack      # Deploy Slack bot
#   ./scripts/deploy.sh --all        # Deploy both
#   ./scripts/deploy.sh --setup      # First-time setup
#
# Prerequisites:
#   - Fly CLI installed: curl -L https://fly.io/install.sh | sh
#   - Logged in: fly auth login

set -e

# Configuration
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HTTP_APP="cope-agent"
SLACK_APP="cope-slack-bot"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[INFO]${NC} $1"; }

# Check for fly CLI
if ! command -v fly &> /dev/null; then
    error "Fly CLI not found. Install with: curl -L https://fly.io/install.sh | sh"
fi

cd "$LOCAL_DIR"

# Parse arguments
DEPLOY_HTTP=false
DEPLOY_SLACK=false
SETUP=false

case "${1:-}" in
    --slack)
        DEPLOY_SLACK=true
        ;;
    --all)
        DEPLOY_HTTP=true
        DEPLOY_SLACK=true
        ;;
    --setup)
        SETUP=true
        ;;
    *)
        DEPLOY_HTTP=true
        ;;
esac

# First-time setup
if [ "$SETUP" = true ]; then
    echo ""
    info "=== COPE Agent Fly.io Setup ==="
    echo ""

    # Check if logged in
    if ! fly auth whoami &> /dev/null; then
        log "Logging in to Fly.io..."
        fly auth login
    fi

    # Create HTTP server app
    log "Creating HTTP server app..."
    fly apps create "$HTTP_APP" --org personal 2>/dev/null || warn "App $HTTP_APP may already exist"

    echo ""
    info "Now set your secrets:"
    echo ""
    echo "  fly secrets set -a $HTTP_APP \\"
    echo "    ANTHROPIC_AUTH_TOKEN=your-key \\"
    echo "    COPE_API_KEY=\$(openssl rand -hex 32) \\"
    echo "    SANITY_PROJECT_ID=your-project \\"
    echo "    SANITY_API_TOKEN=your-token \\"
    echo "    SANITY_DATASET=production"
    echo ""

    read -p "Create Slack bot app too? (y/N) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log "Creating Slack bot app..."
        fly apps create "$SLACK_APP" --org personal 2>/dev/null || warn "App $SLACK_APP may already exist"

        echo ""
        info "Set Slack bot secrets:"
        echo ""
        echo "  fly secrets set -a $SLACK_APP \\"
        echo "    ANTHROPIC_AUTH_TOKEN=your-key \\"
        echo "    SLACK_BOT_TOKEN=xoxb-... \\"
        echo "    SLACK_APP_TOKEN=xapp-... \\"
        echo "    SANITY_PROJECT_ID=your-project \\"
        echo "    SANITY_API_TOKEN=your-token"
        echo ""
    fi

    echo ""
    info "Setup complete! Now run: ./scripts/deploy.sh"
    echo ""
    exit 0
fi

# Build TypeScript
log "Building TypeScript..."
npm run build

# Deploy HTTP server
if [ "$DEPLOY_HTTP" = true ]; then
    log "Deploying HTTP server to Fly.io..."
    fly deploy --remote-only

    echo ""
    log "HTTP server deployed!"
    info "URL: https://$HTTP_APP.fly.dev"
    info "Health: https://$HTTP_APP.fly.dev/health"
    echo ""
fi

# Deploy Slack bot
if [ "$DEPLOY_SLACK" = true ]; then
    log "Deploying Slack bot to Fly.io..."
    fly deploy --config fly.slack.toml --remote-only

    echo ""
    log "Slack bot deployed!"
    echo ""
fi

# Show status
log "Deployment complete!"
echo ""
info "Useful commands:"
echo "  fly status                    # HTTP server status"
echo "  fly logs                      # HTTP server logs"
echo "  fly status -a $SLACK_APP   # Slack bot status"
echo "  fly logs -a $SLACK_APP     # Slack bot logs"
echo "  fly secrets list              # View configured secrets"
