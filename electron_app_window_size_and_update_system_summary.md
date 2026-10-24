# Summary: Window Dimensions and Update Mechanisms for Electron Desktop Applications

## 1. Window Size Configuration
- **Unrecommended Dimensions:** Avoid portrait aspect ratios such as `1444x1600` as they cause vertical overflow on most desktop displays.
- **Recommended Standard Dimensions (Landscape):**
  - `1200 x 800` px (Optimal and balanced for HD/Full HD screens)
  - `1366 x 768` px (Best for legacy laptop displays)
  - `1440 x 900` px (Suitable for larger displays or MacBook Retina screens)

---

## 2. Software Update Mechanisms (Supporting Portable `.exe`)
The application includes a version management interface accessible via the Window menu, supporting two update modes:

### A. Online Update (Automated via GitHub Releases)
- Powered by `electron-updater` in the Main Process.
- **Version Skipping:** If a user is currently on version `1.0.4` and version `1.2.0` is published to GitHub Releases, the app detects the latest release and updates directly to `1.2.0`, skipping intermediate releases (`1.0.5`, `1.1.0`, etc.).

### B. Manual Update (File Import)
- The React UI provides an input option for users to import update files (`.zip` or `.asar`).
- The Main Process receives the file path, overwrites the current bundle at `process.resourcesPath`, and invokes `app.relaunch()` to restart the application with the updated code.

---

## 3. Crucial Considerations for Portable `.exe` Builds
- Because Portable executables unpack to temporary directories during runtime, configure a persistent path for `userData` (e.g., using `app.setPath('userData', ...)`). This ensures user settings and local data persist across application updates.