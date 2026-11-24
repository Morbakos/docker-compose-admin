# Releasing Compose Admin

## Versioning

Before preparing a release, update the same semantic version in all three files:

- `src-tauri/tauri.conf.json` (`version`)
- `src-tauri/Cargo.toml` (`package.version`)
- `package.json` (`version`)

The release workflow verifies that all three versions match the pushed tag. For version `0.2.0`, push the tag `v0.2.0`.

## Configure the Tauri updater signing key (required)

Tauri verifies every update bundle with a public key embedded in the application. The private key must never be committed or added to a Docker image.

Generate one key pair on a trusted workstation:

```bash
bun tauri signer generate -- -w ~/.tauri/compose-admin.key
```

Keep the generated private key safe and backed up. Losing it means existing installations can no longer verify future updates signed with that key.

Configure the repository's GitHub Actions settings:

- Add a repository **variable** named `TAURI_UPDATER_PUBLIC_KEY` containing the complete contents of `compose-admin.key.pub`.
- Add a repository **secret** named `TAURI_SIGNING_PRIVATE_KEY` containing the complete contents of `compose-admin.key`.
- If the private key has a password, add the secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

The release workflow fails before building if either key is missing. The public key is injected into `tauri.conf.json` and compiled into the application during the release workflow; the private key is used only to sign release artifacts. The placeholder value committed in the configuration is never used for a published build. Do not rotate this key casually: already-installed versions trust the public key embedded in their own binary.

## Create a release

After updating the version in all three files and configuring the signing variable/secret:

```bash
git tag v0.2.0
git push origin v0.2.0
```

The release workflow builds Windows x64, macOS Intel (x64), and macOS Apple Silicon (arm64) packages. It publishes the installers, signed updater bundles, and `latest.json` to the GitHub Release. The application checks that manifest at startup and offers an update when a newer compatible version is available.

The regular CI workflow continues to validate pushes and pull requests. It does not need the updater private key and does not publish releases.

## Native operating-system code signing (recommended)

Updater signing and operating-system code signing are separate mechanisms.

For Windows Authenticode signing, configure these optional repository secrets:

- `WINDOWS_CERTIFICATE`: base64-encoded signing certificate.
- `WINDOWS_CERTIFICATE_PASSWORD`: certificate password.

For macOS distribution without Gatekeeper warnings, configure an Apple Developer ID certificate and notarization credentials:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD` (app-specific password)
- `APPLE_TEAM_ID`

Without Apple signing and notarization, macOS users may need to approve the downloaded app manually in macOS security settings. Without Windows signing, SmartScreen may show an unknown-publisher warning. These certificates are not required for Tauri updater signature verification, but are recommended before broad distribution.
