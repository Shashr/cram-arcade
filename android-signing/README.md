# Signing key for the Android app

The key that signs the Android app is **not** in this repository. It is stored as the
GitHub Actions secret `ANDROID_KEYSTORE_B64` (the keystore file, base64-encoded), and the
cloud build (`.github/workflows/android.yml`) decodes it only while building.

- Key alias: `cramarcade`
- Keep a backup of the keystore file somewhere safe and private. Android only installs an
  update if it's signed with the same key as the version already on the phone, so losing it
  means everyone would have to uninstall and reinstall.

Google Play uses its own separate upload key, created when you first publish there.
