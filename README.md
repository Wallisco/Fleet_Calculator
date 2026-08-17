# ScootHero — fleet site + calculator service

One Node service that serves the marketing site **and** the proposal API from the
same origin (`fleet.scoothero.co.za`), so there is no CORS to configure.

```
public/          the site, including calculators.html and the calculator page
public/model.js  the financial model — shared by the page and the server
lib/pdf.js       branded proposal PDF (PDFKit)
lib/email.js     customer + sales emails (Resend)
lib/hubspot.js   contact upsert, file upload, note attachment
server.js        API + static hosting
```

## Deploy on Render

**Web Service** (not a Static Site — a static site cannot run Node, so the PDF,
email and HubSpot writes will not work).

- Build: `npm install`
- Start: `npm start`
- Health check: `/healthz`
- Instance: Starter (free instances sleep, so the first proposal takes ~30s)

`package.json` and `server.js` must be at the repo root.

### Environment variables
```
HUBSPOT_TOKEN     pat-eu1-…      private app, portal 148678580
RESEND_API_KEY    re_…           full-access key
MAIL_FROM         ScootHero <proposals@scoothero.co.za>
MAIL_REPLY_TO     sales@scoothero.co.za
SALES_INBOX       wahlied@scoothero.co.za,dewald@scoothero.co.za
BOOKING_URL       https://fleet.scoothero.co.za/demo.html
HUBSPOT_FOLDER    /calculator-proposals
ALLOWED_ORIGINS   https://fleet.scoothero.co.za
```

`/healthz` returns `{"ok":true,"hubspot":true,"resend":true}` when both keys load.
A `false` means that variable did not save.

## HubSpot properties

Run once, if the private app has `crm.schemas.contacts.write`:

```
npm run setup:hubspot
```

**If that scope is not available on your tier, skip it.** The service detects the
missing `calc_*` properties, retries the write without them, and logs a warning.
Contacts are still created, the proposal PDF is still uploaded and attached to a
note, and the full calculation appears in the note body. You only lose the
filterable custom fields. Create them by hand in Settings → Properties later and
they start populating on the next run, with no code change.

Private app scopes needed either way: `crm.objects.contacts.read`,
`crm.objects.contacts.write`, `files`.

## Troubleshooting

| Symptom | Cause |
|---|---|
| "No connection" in the browser | Node is not running — `/healthz` returns Not Found. Deployed as a Static Site, or an old build with a hardcoded `SH_API`. |
| "could not email them" | Server reached, Resend rejected. Check the `[email] send failed:` line in the logs. |
| `Resend 401` | Bad or truncated API key, or a sending-only key restricted to another domain. |
| `Resend 403` | Domain not verified, or `MAIL_FROM` does not match the verified domain exactly. |
| `PROPERTY_DOESNT_EXIST` | Expected without the schema scope — handled automatically, see above. |

For a quick send test without domain verification, set
`MAIL_FROM=ScootHero <onboarding@resend.dev>`. It only delivers to the address that
owns the Resend account.
