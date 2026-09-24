# App Configuration

The settings page shown when the app is installed on a stack. Every other app in this repo that needs credentials reads them from here.

## Where it runs

| | |
|---|---|
| UI location | App configuration (`cs.cm.stack.config`) |
| Route | `/app-configuration` |
| Provider | `AppConfigurationExtensionProvider` |

## Fields

| Section | Field | Used by |
|---------|-------|---------|
| Stack | **Stack API Key** (`blt…`) | Entry Draft, Branch Console, Custom Dashboard, AI Content Generator |
| Stack | **Management Token** (`cs…`) | Same as above |
| Stack | **Delivery Token** (`cs…`) | Reserved; nothing reads it today |
| Region | **US / EU / Azure NA**, or a custom API URL | Sets the Management API base URL for the apps above |
| OpenAI | **API Key**, optional **Org ID** | AI Content Generator, SEO/AEO/GEO Demo |

Apps that go through `appSdk.stack` (Locale Status, Localize From Locale, Find & Replace) need nothing from this page.

## Behaviour

- Validation runs on change and on blur: prefix checks, URL parsing, region allow-list. A live checklist shows what is still wrong, and the Save button is blocked through `installation.setValidity` until it passes.
- Values are saved through `installation.setInstallationData`. OpenAI keys are mirrored into `serverConfiguration`.
- **Test Connection** makes a direct Management API request with the entered key and token and reports the result.
- Older installs that saved keys under legacy names (`stackApiKey`, `managementToken`, `accessToken`, `openai_api_key`) are still read, with a one-time fallback.

## Security notes

Management and OpenAI tokens are stored in the app's installation data and used from the browser. That is acceptable for internal tooling and demos. For a shared or production deployment, put a backend proxy in front of OpenAI and scope the management token to what the enabled apps need.

## Files

| File | Purpose |
|------|---------|
| `AppConfiguration.tsx` | Form, validation status, save and test flows |
| `configValidation.ts` | Validation rules |
| `types.ts` | Config shape |
