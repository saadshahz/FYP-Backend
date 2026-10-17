# Frontend integration guide

This guide describes the backend as it is implemented today. The API is an
Express JSON API, not a cookie/session API. The backend remains the authorization
boundary; frontend checks should only control presentation.

## Base URL and documentation

The API port is configured by `PORT`. The checked-in backend example uses port
`5000`; the server falls back to `3000` only when `PORT` is unset:

```text
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
```

Use the same-origin API proxy in deployed frontend environments where possible.
With the example port, interactive docs are at `http://localhost:5000/api/docs`;
the raw OpenAPI document is at `http://localhost:5000/api/docs/openapi.json`.
The health check is
`GET /api/v1/health`.

The backend does not currently configure rate limiting. CORS allows only the
exact comma-separated origins in `FRONTEND_ORIGINS` (default:
`http://localhost:3000`) and the required API methods and `Authorization` /
`Content-Type` headers. Set the deployed frontend's exact origin in the backend
environment; wildcard origins and credentialed CORS are not enabled.

## Authentication

1. Register with `POST /auth/register`, choosing `organizationType` `consumer`
   or `provider`. Registration creates an active user, active organization, and
   owner membership. A provider profile starts as `pending`.
2. Log in with `POST /auth/login`. The response contains `accessToken`,
   `tokenType: "Bearer"`, and `expiresIn: 3600`.
3. Send the access token on protected requests as
   `Authorization: Bearer <accessToken>`.
4. Fetch `GET /auth/me` to load the current account profile and memberships.

There is no refresh-token endpoint, cookie authentication, or logout/revocation
endpoint. Keep access tokens in memory when practical, or use a trusted
same-origin backend-for-frontend (BFF) to keep credentials out of browser
storage. Do not treat `localStorage` as a secure token vault. On token expiry or
invalid-token `401`, send the user through login again.

```js
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1";

async function apiRequest(path, { token, ...options } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(result?.error ?? `Request failed (${response.status})`);
    error.status = response.status;
    error.payload = result;
    throw error;
  }
  return result;
}
```

`/auth/me` returns identity fields using the existing response names. In
particular, `platform_role` is a platform role (`user`, `admin`, or `support`);
each membership has an organization type and membership role. Use the
membership's `organizationId`, `organizationType`, and `role` to select the
correct user interface. Do not trust client-supplied role values for access
control. Provider marketplace visibility also depends on the provider profile
being approved and its organization being active.

## Organization selection and permissions

Organization-scoped APIs use the verified user identity and active memberships
in the database. Where an endpoint accepts `organizationId`, send it when the
user's active memberships make the selection ambiguous; otherwise the backend
may return `409`. Never infer that an organization ID sent by the browser is
authorized—the backend verifies membership.

Common write permissions are active organization `owner`, `admin`, or `manager`
membership. Some operations have narrower requirements:

- Consumer assets, service requests, invoice payment recording, and reviews
  require an appropriate consumer organization membership.
- Provider service management, quotes, contracts/work orders, and invoicing
  require provider membership as documented by the endpoint.
- Technician assignment requires an active technician membership in the
  associated approved provider organization.
- Provider approval/rejection requires a platform administrator. If none is
  provisioned, a trusted operator must provision one through a protected
  database administration workflow; public registration cannot create one.
- Support actions use the active platform `admin`/`support` role where stated.

The admin approval endpoints check the current platform role in PostgreSQL.
The JWT is an identity token, not a source of authorization claims.

## Responses, errors, and pagination

Most resource responses use `{ "data": ... }`; paginated endpoints use
`{ "data": [...], "pagination": { "page", "limit", "total", "totalPages" } }`.
Some existing list endpoints return a bare `{ "data": [...] }` array wrapper;
check that operation's OpenAPI response rather than assuming all lists are
paginated. `totalPages` may be zero for an empty result. Pagination starts at
page 1, defaults to `page=1&limit=20`, and limits are capped at 100. Responses
do not include `hasNext`, `hasPrevious`, or a next-page cursor; calculate page
controls from `page`, `totalPages`, and `total`.

Errors use the actual response shape:

```json
{ "error": "A human-readable message." }
```

- `400`: invalid ID, query, or JSON body; show the returned message near the
  relevant form/control.
- `401`: missing/invalid/expired token or inactive account; reauthenticate.
- `403`: authenticated account lacks the required role/permission.
- `404`: missing resource, or a resource intentionally hidden because it is not
  accessible to the caller.
- `409`: valid request conflicts with current membership selection or resource
  workflow state; refresh the resource and explain the conflict.
- `500`: unexpected server error; show a generic message and avoid retry loops.
- `503`: health check only, when the database is unavailable.

The API does not return a structured validation `details` object or `422`
responses. Do not parse error text as a stable machine-readable code.

## Consumer workflow

1. Register/login, then load `/auth/me` and select the consumer membership.
2. Load public catalogs with `GET /industries` and
   `GET /service-categories?industryId=<uuid>`.
3. Register equipment with `POST /assets?organizationId=<consumer-org-uuid>`.
   Asset deletion is a retirement operation, not a hard delete.
4. Create a request with `POST /requests?organizationId=<consumer-org-uuid>`.
   Supply a non-empty `serviceCategoryId` or `serviceType` and `description`;
   optionally include an owned active `assetId`, priority, and
   timezone-qualified `preferredAt`.
5. List available providers at `GET /marketplace/providers`, or wait for an
   eligible provider to submit a quote. Providers must be active and approved
   to appear in the marketplace.
6. Read quotes at `GET /requests/{requestId}/quotes`. Only submitted or later
   quotes are visible to the consumer. Accept one with
   `POST /quotes/{quoteId}/accept`; acceptance rejects competing submitted
   quotes and cancels other drafts.
7. Follow `GET /contracts?organizationId=...` and the contract actions:
   `send -> accept -> activate`. Contract creation is from an accepted quote.
8. Follow the associated work order. A provider creates it from an active
   contract; it proceeds through `pending -> scheduled -> in_progress ->
   completed`. Eligible orders can be cancelled. A technician must be assigned
   by the provider before technician-specific work actions.
9. The provider creates an invoice from completed work, supplies line items,
   and issues it with a future due date. The consumer records payments; the
   provider confirms/fails/refunds the internal ledger entry. This is not a
   payment-gateway integration.
10. After completed work, the consumer may create one review per service
    request. Reviews require a completed work order for that request's provider.

Example request calls (replace IDs and token with values from your own
environment):

```js
const asset = await apiRequest("/assets?organizationId=CONSUMER_ORG_UUID", {
  token,
  method: "POST",
  body: JSON.stringify({
    name: "HVAC Unit 1",
    category: "HVAC",
    installDate: "2025-01-15",
  }),
});

const request = await apiRequest("/requests?organizationId=CONSUMER_ORG_UUID", {
  token,
  method: "POST",
  body: JSON.stringify({
    assetId: asset.data.id,
    serviceCategoryId: "SERVICE_CATEGORY_UUID",
    description: "Inspect and repair the cooling unit.",
    priority: "normal",
  }),
});

const quotes = await apiRequest(`/requests/${request.data.id}/quotes`, { token });
await apiRequest(`/quotes/${quotes.data[0].id}/accept`, { token, method: "POST" });
```

## Provider workflow

Register with `organizationType: "provider"` and complete the provider
organization/profile information. Pending providers may maintain services and
onboarding details, but they do not appear in public marketplace results and
cannot perform operations that require approval. A platform administrator
approves or rejects the organization through the admin endpoints. Once approved,
the provider can discover matching requests, submit a draft quote, and proceed
through contract, work-order, and invoice workflows.

Create a quote with
`POST /requests/{requestId}/quotes?organizationId=<provider-org-uuid>` using
line items (`description`, `quantity`, `unitPrice`), then call
`POST /quotes/{quoteId}/submit?organizationId=<provider-org-uuid>`. Quote totals
are calculated by the backend; clients do not set them or quote status.

## Support and notifications

Support tickets are visible to their creator and active support/admin staff.
The current schema does not associate tickets with an organization, request,
invoice, or other business record. Ticket statuses are `open`,
`in_progress`, `resolved`, and `closed`; closed tickets cannot receive messages
until reopened.

Use:

- `GET /support/tickets?page=1&limit=20` to list tickets.
- `POST /support/tickets` with `subject`, `description`, and optional
  `category`/`priority` to create a ticket.
- `GET/POST /support/tickets/{id}/messages` to read/send messages.
- `POST /support/tickets/{id}/resolve`, `/close`, or `/reopen` for lifecycle
  actions permitted to the caller.

Notifications are user-scoped:

- `GET /notifications?page=1&limit=20&unreadOnly=true`
- `GET /notifications/unread-count`
- `POST /notifications/{id}/read`
- `POST /notifications/read-all`

## Other current API constraints

- `GET /reviews` is authenticated even though it returns public approved
  provider reviews.
- Attachments are metadata records only. No file upload, download, or storage
  verification is implemented. Exactly one of `serviceRequestId` or `ticketId`
  is required.
- There is no service-request message pagination.
- `POST /work-orders/{id}/start` and `/cancel` currently hit an undefined
  validator reference in their shared controller handler and return `500`.
  These routes are documented for route completeness, but should not be used
  until that separate runtime issue is fixed.
