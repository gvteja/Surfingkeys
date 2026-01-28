# Native Messaging Host for Surfingkeys

This directory contains the native messaging host that allows Surfingkeys to communicate with external processes on your system.

## How Chrome Native Messaging Works

Native messaging enables a Chrome extension to exchange messages with a native application installed on the user's computer. Here's the complete flow:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NATIVE MESSAGING FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

1. Extension calls chrome.runtime.connectNative("com.vijayt.surfingkeys")
                                    │
                                    ▼
2. Chrome looks up the host name in the system's NativeMessagingHosts directory
   
   macOS:   ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/
   Linux:   ~/.config/google-chrome/NativeMessagingHosts/
   Windows: Registry key points to JSON location
                                    │
                                    ▼
3. Chrome finds and reads: com.vijayt.surfingkeys.json
   
   {
     "name": "com.vijayt.surfingkeys",        ← Must match connectNative() argument
     "description": "...",
     "path": "/path/to/surfingkeys_cli.py",   ← Executable to launch
     "type": "stdio",                          ← Communication via stdin/stdout
     "allowed_origins": [
       "chrome-extension://khekmepigbmnkgmkboadbmgpifnbhidm/"  ← Your extension ID
     ]
   }
                                    │
                                    ▼
4. Chrome verifies the extension ID matches allowed_origins
                                    │
                                    ▼
5. Chrome launches the executable specified in "path"
                                    │
                                    ▼
6. Chrome sets up stdin/stdout pipes for bidirectional communication

   ┌──────────────┐         stdin          ┌──────────────────┐
   │              │ ─────────────────────► │                  │
   │  Extension   │                        │  Native Host     │
   │  (JS)        │ ◄───────────────────── │  (Python)        │
   │              │        stdout          │                  │
   └──────────────┘                        └──────────────────┘
```

## Message Format

Messages are passed as JSON with a 4-byte length prefix (native byte order):

```
┌─────────────┬─────────────────────────────────────┐
│ Length (4B) │ JSON Message (UTF-8)                │
└─────────────┴─────────────────────────────────────┘
```

**Extension → Native Host:**
```javascript
port.postMessage({ command: "chooseTab" });
// Chrome encodes this as: [length bytes][{"command":"chooseTab"}]
```

**Native Host → Extension:**
```python
# Native host must write: [4-byte length][JSON bytes]
message = json.dumps({"status": "ok"}).encode('utf-8')
sys.stdout.buffer.write(struct.pack('I', len(message)))
sys.stdout.buffer.write(message)
```

## Process Lifecycle

### When is the native host started?

A **new process is spawned** each time the extension calls `chrome.runtime.connectNative()`. The process runs as long as the connection port remains open.

```
connectNative() called  ──►  Chrome spawns process  ──►  Process runs until:
                                                          • Extension calls port.disconnect()
                                                          • Extension/page is unloaded
                                                          • Process exits or crashes
                                                          • Browser closes
```

### What happens if it crashes?

Chrome does **NOT** automatically restart crashed native hosts. When the process exits (normally or crashes):

1. Chrome fires the `port.onDisconnect` event
2. `chrome.runtime.lastError` contains the error message (if any)
3. The extension must explicitly reconnect if needed

```javascript
const port = chrome.runtime.connectNative("com.vijayt.surfingkeys");

port.onDisconnect.addListener(() => {
    if (chrome.runtime.lastError) {
        console.error("Native host error:", chrome.runtime.lastError.message);
        // Common messages:
        // - "Native host has exited."
        // - "Specified native messaging host not found."
    }
    
    // Optionally reconnect after a delay
    setTimeout(() => {
        reconnect();
    }, 5000);
});
```

### Process isolation

- Each `connectNative()` call spawns a **separate process**
- Multiple extensions can connect to the same native host (separate processes)
- The native host has no access to browser APIs—only stdin/stdout communication

## Files in This Directory

| File | Purpose |
|------|---------|
| `surfingkeys_cli.py` | The native host executable (Python script) |
| `install.sh` | Installation script for macOS/Linux |
| `com.vijayt.surfingkeys.json` | Template manifest (installed by `install.sh`) |

## Installation

Run the install script:

```bash
cd native-host
./install.sh
```

This will:
1. Create the NativeMessagingHosts directory if needed
2. Make `surfingkeys_cli.py` executable
3. Generate and install the manifest JSON with correct paths

## Extension IDs

The manifest must include your extension's ID in `allowed_origins`. This extension supports:

| ID | Version |
|----|---------|
| `khekmepigbmnkgmkboadbmgpifnbhidm` | Development (from manifest.json key) |
| `aajlcoiaogpknhgninhopncaldipjdnp` | Chrome Web Store |

## Troubleshooting

### "Specified native messaging host not found"

1. **Check the manifest exists:**
   ```bash
   cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.vijayt.surfingkeys.json
   ```

2. **Verify the host name matches:**
   - `chrome.runtime.connectNative("com.vijayt.surfingkeys")` in JS
   - `"name": "com.vijayt.surfingkeys"` in the JSON manifest

3. **Verify your extension ID is in `allowed_origins`:**
   - Find your ID at `chrome://extensions` (enable Developer mode)
   - Must include trailing slash: `chrome-extension://YOUR_ID/`

4. **Check the path is absolute and correct:**
   ```bash
   ls -la /path/shown/in/manifest/surfingkeys_cli.py
   ```

### "Access to the specified native messaging host is forbidden"

Your extension ID is not in `allowed_origins`. Re-run `install.sh` or manually add your ID.

### "Native host has exited"

The executable crashed. Check:
1. Script is executable: `chmod +x surfingkeys_cli.py`
2. Shebang is correct: `#!/usr/bin/env python3`
3. Test manually: `echo '{"test":1}' | python3 surfingkeys_cli.py`

## Code Reference

The extension connects to the native host in `src/background/chrome.js`:

```javascript
const cliHost = chrome.runtime.connectNative("com.vijayt.surfingkeys");
cliHost.onMessage.addListener((msg) => {
    // Handle messages from native host
});
cliHost.postMessage({ command: "someCommand" });
```

## Further Reading

- [Chrome Native Messaging Documentation](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
