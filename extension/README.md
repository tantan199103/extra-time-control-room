# POD Bridge V1

Internal Manifest V3 extension for collecting selected ChatGPT assistant messages into a Product Session and importing the result as a draft listing.

## Build and install

1. Run `npm run build:extension` for the production manifest.
2. Open `chrome://extensions` or `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist-extension`.
3. Open ChatGPT and click **Start Product** in the POD Bridge side panel. Use **Add to POD** on the assistant messages you want.
4. Sign in to the WebApp as an Extra Time admin. **Send to WebApp** opens `/admin/bridge` and resumes the transfer.

`npm run dev:extension` watches an unpacked development build and switches the generated manifest to the localhost-enabled variant. Reload the extension after a rebuild. `npm run package:extension` creates `artifacts/pod-bridge-v1.zip`.

## Security boundaries

- The production manifest only grants access to `chatgpt.com` and `extra-time-control-room.vercel.app`.
- The extension never reads Supabase tokens, cookies, passwords, or service-role keys.
- The WebApp's authenticated admin session performs all database and Storage writes.
- Incoming messages, Product Packs, asset descriptors, nonce values, MIME types, sizes, and SHA-256 hashes are validated by the receiver.
- Bridge-created listings and variants are always drafts. The receiver rejects sync to a listing that is no longer a draft.
