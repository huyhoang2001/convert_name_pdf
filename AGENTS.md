# B6H project instructions

These instructions apply only to `C:\Users\hinam\Desktop\convert_name_pdf-main` and its existing `wordcraft-upstream` checkout. Read `.agents/skills/b6h-smart-build/SKILL.md` before B6H development, testing, builds, Wordcraft integration, or cleanup.

- Default to `npm.cmd run dev` for development and hot reload. Keep frontend-only updates on `npm.cmd run build:frontend-update`; they must not compile Cargo, NSIS, or Wordcraft source.
- Select tests for the changed functionality. Do not run the full Wordcraft native workspace suite for unrelated B6H changes or minor UI edits. Use a package- and test-filtered Cargo test when Wordcraft Rust changes need native validation.
- Build Wordcraft WASM only for actual Wordcraft source changes that need runtime verification. Reuse the existing checkout and Cargo target; group related edits before an expensive WASM build.
- Keep the existing `src-tauri/target` and `wordcraft-upstream/target`. Use `x86_64-pc-windows-msvc` for authorized Windows installer and production Core builds. Do not use an un-targeted release build that creates a second default-host release cache.
- Require explicit owner authorization before production packaging, update-package generation, or signing. Do not commit, push, tag, publish, or change version metadata without separate authorization.
- Preserve source, uncommitted work, Git metadata, signing credentials, current production artifacts, user data, Graphify output, and the validated Wordcraft runtime. Never run blanket `cargo clean` or broad cache deletion.
- For an authorized release, use `npm.cmd run release:prepare` to detect changed components, allocate the next unused maintenance version, and update only their component versions. Review its generated metadata and release notes, commit the release prep, then create and push the matching `vX.Y.Z` tag.
- The tag workflow validates changes against the prior stable tag, builds/packages only affected components, carries forward compatible signed catalog entries, verifies all release assets, and promotes the GitHub Release only after verification. It must not use `head_commit` message markers to select the build path.
- GitHub Actions production signing uses the protected `b6h-production-release` environment secret `B6H_UPDATE_SIGNING_KEY_B64`. The workflow verifies it against `B6H_UPDATE_TRUST_ROOTS` before building and fails closed if it is missing or mismatched. Never use local test keys for stable releases.
- Preserve the existing local signing key at `%LOCALAPPDATA%\B6H\release-signing\update-private.pem`; do not print or commit it. Set up the Actions secret only through the owner-approved secure repository procedure documented in `docs/DEVELOPER_RELEASES.md`.
