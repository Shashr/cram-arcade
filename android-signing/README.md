# Signing key for website downloads

`sideload.keystore` signs the Android app that people download from
cram-arcade.vercel.app/downloads. Android only installs an update if it's signed with the
same key as the version already on the phone, so this file must never change.

- Store and key password: `android` (it's kept in this private repo on purpose so the
  cloud build can use it; it is not used for Google Play)
- Key alias: `cramarcade`

Google Play uses its own separate upload key, created when you first publish there.
