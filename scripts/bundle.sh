#!/bin/bash
#
# COPE Agent MCPB Bundle Script
#
# Creates an MCPB bundle (.mcpb file) ready for distribution.
# The bundle includes the compiled server, dependencies, and configuration.
#
# Usage: npm run bundle
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BUNDLE_NAME="cope-agent"
BUNDLE_DIR="bundle"
OUTPUT_FILE="${BUNDLE_NAME}.mcpb"

echo -e "${GREEN}=== COPE Agent MCPB Bundle Builder ===${NC}"
echo ""

# Step 1: Clean previous build
echo -e "${YELLOW}[1/7] Cleaning previous bundle...${NC}"
rm -rf "$BUNDLE_DIR" "$OUTPUT_FILE"

# Step 2: Build TypeScript
echo -e "${YELLOW}[2/7] Building TypeScript...${NC}"
npm run build

# Step 3: Create bundle directory structure
echo -e "${YELLOW}[3/7] Creating bundle structure...${NC}"
mkdir -p "$BUNDLE_DIR/dist"
mkdir -p "$BUNDLE_DIR/config"
mkdir -p "$BUNDLE_DIR/assets"

# Step 4: Copy required files
echo -e "${YELLOW}[4/7] Copying files...${NC}"

# Copy manifest.json
cp manifest.json "$BUNDLE_DIR/"

# Copy compiled JavaScript (dist folder)
cp -r dist/* "$BUNDLE_DIR/dist/"

# Copy config files needed at runtime
cp config/capabilities.yaml "$BUNDLE_DIR/config/"
cp config/identity.md "$BUNDLE_DIR/config/"

# Copy package.json (for version info) - create minimal version
node -e "
const pkg = require('./package.json');
const minimal = {
  name: pkg.name,
  version: pkg.version,
  type: pkg.type,
  main: 'dist/mcpb-server.js',
  dependencies: pkg.dependencies
};
require('fs').writeFileSync('$BUNDLE_DIR/package.json', JSON.stringify(minimal, null, 2));
"

# Note: No icon included - Claude Desktop will use default

# Step 5: Install production dependencies in bundle
echo -e "${YELLOW}[5/7] Installing production dependencies...${NC}"
cd "$BUNDLE_DIR"
npm install --omit=dev --ignore-scripts 2>/dev/null || {
  echo -e "${YELLOW}    Running npm install with legacy peer deps...${NC}"
  npm install --omit=dev --ignore-scripts --legacy-peer-deps
}
cd ..

# Step 6: Validate manifest
echo -e "${YELLOW}[6/7] Validating manifest...${NC}"
node -e "
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('$BUNDLE_DIR/manifest.json', 'utf8'));
console.log('    Entry point: ' + manifest.server.entry_point);
console.log('    Server type: ' + manifest.server.type);
console.log('    Tools: ' + (manifest.tools?.length || 0));
"

# Step 7: Create the .mcpb archive (ZIP format)
echo -e "${YELLOW}[7/7] Creating MCPB archive...${NC}"
cd "$BUNDLE_DIR"
zip -r "../$OUTPUT_FILE" . -x "*.DS_Store" -x "__MACOSX/*"
cd ..

# Calculate bundle size
BUNDLE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)

# Summary
echo ""
echo -e "${GREEN}=== Bundle Created Successfully ===${NC}"
echo ""
echo "  Bundle: $OUTPUT_FILE ($BUNDLE_SIZE)"
echo "  Contents:"
echo "    - manifest.json (MCPB v0.3)"
echo "    - dist/ (compiled server)"
echo "    - config/ (capabilities, identity)"
echo "    - node_modules/ (dependencies)"
echo "    - package.json (minimal)"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "  1. Test locally: npm run mcpb"
echo "  2. Install in Claude Desktop: drag $OUTPUT_FILE into settings"
echo "  3. Configure credentials in the extension settings"
echo ""

# Validate manifest
echo -e "${YELLOW}Validating manifest...${NC}"
if [ -f "scripts/validate-manifest.js" ]; then
  node scripts/validate-manifest.js "$BUNDLE_DIR/manifest.json" && echo -e "${GREEN}Manifest valid!${NC}"
else
  echo -e "${YELLOW}Validation script not found, skipping...${NC}"
fi

echo ""
echo -e "${GREEN}Done!${NC}"
