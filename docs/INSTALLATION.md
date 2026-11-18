# B6H installation and updates

## Install

Download `B6H-v3.0.0-x64-Setup.exe` from the [latest GitHub release](https://github.com/huyhoang2001/convert_name_pdf/releases/latest). Verify it against the adjacent `.sha256` file before running it. Setup installs B6H for the current Windows user and uses the official B6H logo for the app, installer, uninstaller, and shortcuts.

```powershell
$setup = '.\B6H-v3.0.0-x64-Setup.exe'
$expected = (Get-Content "$setup.sha256").Split(' ')[0]
$actual = (Get-FileHash $setup -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw 'Installer checksum mismatch.' }
```

The lightweight installer is below 50 MB. It uses Microsoft's WebView2 download bootstrapper when WebView2 is missing, which may require internet access. The separate offline WebView2 installer is intentionally not included.

The Setup is **not signed with Authenticode**. Windows may display an unknown-publisher dialog or a Microsoft Defender SmartScreen warning. This is expected for this free, open-source release. Confirm the download came from the official repository and that its SHA-256 matches the published sidecar before deciding whether to run it.

## Updates and recovery

Open **Settings → Update Manager** and choose **Check online** to discover the latest stable GitHub release catalog. B6H verifies the catalog and package signatures with its embedded production Ed25519 trust root, checks SHA-256 and version compatibility, and stages updates before activation. Frontend and Wordcraft updates retain a prior generation for rollback. Core updates use the recovery runner and retain a prior installation so interrupted updates can be recovered or rolled back.

Offline updates can be imported as `.b6hupdate` files through Update Manager. Use only packages from a B6H release with a valid production signature. Do not install local test packages or trust a test certificate.

Application settings and data remain under `%APPDATA%\SAFE PDF RENAME`; update generations and Core recovery snapshots are stored separately under that profile's `updates` directory. If recovery reports an incomplete transaction, keep that directory intact and contact the maintainer.
