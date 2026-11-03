# B6H

B6H is a Windows desktop app for managing numbered PDF files, office registers, and Word documents. It runs locally with a React interface and a Tauri/Rust backend. The interface supports English and Vietnamese.

## What it does

| Workspace | Purpose |
| --- | --- |
| Rename PDFs | Preview new names, then create verified Backup and Output copies. Original PDFs are never renamed or deleted. |
| Count number | Scan numbered files and report missing numbers by group. |
| Translation | Create, import, edit, and save translation Excel registers. |
| Signature authentication | Manage signature records and Excel registers. |
| Copies | Manage certified-copy registers, totals, and Excel files. |
| Word & Templates | Open DOCX documents, use templates, and save managed copies. |
| Settings | Choose language and theme, configure Word folders, and manage register labels and chat access. |

PDF scanning uses files directly inside the selected folder. The Rename PDFs workflow requires a preview and confirmation before copying. It verifies Backup copies before creating Output copies and does not overwrite existing output files. Excel register saves can update the selected workbook, so keep your own copy when editing important data.

## Download and run

1. On a 64-bit Windows PC with the WebView2 runtime, download `B6H-<version>.exe` from the [latest GitHub release](https://github.com/huyhoang2001/convert_name_pdf/releases/latest).
2. Run the portable executable. No installer is required.
3. Choose a workspace from the sidebar. For PDF renaming, select a folder, review the preview, then confirm the verified copy.

B6H stores its settings and local app data under `%APPDATA%\SAFE PDF RENAME`. The app can check GitHub Releases for newer portable versions.

## Chat help

The in-app help works offline by default. Online chat is optional and uses OpenRouter. To enable it, enter an OpenRouter API key in **Settings**; B6H stores that key in Windows Credential Manager. If no Settings key is saved, it can use `OPENROUTER_API_KEY` from the environment or a `.env` file beside the executable (in the repository root during development). Online questions are sent to OpenRouter; the PDF and register workflows work without it.

## Develop on Windows

Install Node.js 24, the stable Rust MSVC toolchain, Visual Studio C++ build tools, and WebView2. Then run these commands from the repository root in PowerShell:

```powershell
npm.cmd ci
npm.cmd run dev
```

Run the automated tests and production frontend build with:

```powershell
npm.cmd test
npm.cmd run web:build
```

`src/` contains the React UI and shared logic; `src-tauri/` contains native file operations, storage, chat, and update handling. The [Windows release workflow](.github/workflows/release.yml) builds the portable executable when a version tag is pushed.
