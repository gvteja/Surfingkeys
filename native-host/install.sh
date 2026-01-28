#!/bin/bash
#
# Install script for Surfingkeys CLI native messaging host.
# Configures the native messaging manifest and installs it for Chrome.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MANIFEST_NAME="com.vijayt.surfingkeys.json"
MANIFEST_SRC="$SCRIPT_DIR/$MANIFEST_NAME"
HOST_SCRIPT="$SCRIPT_DIR/surfingkeys_cli.py"

# Detect OS and set Chrome native messaging hosts directory
case "$(uname -s)" in
    Darwin)
        HOSTS_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
        ;;
    Linux)
        HOSTS_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
        ;;
    *)
        echo "Error: Unsupported operating system"
        exit 1
        ;;
esac

# Create hosts directory if it doesn't exist
mkdir -p "$HOSTS_DIR"

# Make the host script executable
chmod +x "$HOST_SCRIPT"


# Create the manifest with correct paths
cat > "$HOSTS_DIR/$MANIFEST_NAME" << EOF
{
  "name": "com.vijayt.surfingkeys",
  "description": "Surfingkeys CLI native messaging host",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://khekmepigbmnkgmkboadbmgpifnbhidm/",
    "chrome-extension://aajlcoiaogpknhgninhopncaldipjdnp/"
  ]
}
EOF

echo "Installed native messaging host:"
echo "  Manifest: $HOSTS_DIR/$MANIFEST_NAME"
echo "  Host script: $HOST_SCRIPT"
echo ""
echo "Next steps:"
echo "  1. Reload the Surfingkeys extension in chrome://extensions"
echo "  2. Test with: curl http://127.0.0.1:37912/health"
echo "  3. Trigger tab selector: curl -X POST http://127.0.0.1:37912/chooseTab"
echo "  4. Restart extension + reload tabs: curl -X POST http://127.0.0.1:37912/restart"
