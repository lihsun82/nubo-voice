# NUBO guest voice: live rooms and booking handoff

NUBO guest voice runs on `https://nubo.ainubo.com/`. It already calls
`POST /api/pms/v1/availability` after collecting check-in, check-out and adult
count. Without a direct PMS read endpoint, that route uses the periodic snapshot.
`covered:false` means no matching snapshot row, not sold out.

## PMS read endpoint

Provide a server-to-server HTTPS POST endpoint and a dedicated bearer token.
NUBO sends:

```json
{"propertyId":"ainubo-taichung-jinxin","checkIn":"2026-12-01","checkOut":"2026-12-02","adults":2}
```

For a successful query, return the same four fields plus an ISO 8601 `asOf`
timestamp from the actual inventory read and `roomTypes`:

```json
{
  "propertyId":"ainubo-taichung-jinxin",
  "checkIn":"2026-12-01",
  "checkOut":"2026-12-02",
  "adults":2,
  "asOf":"2026-11-17T23:00:00+08:00",
  "roomTypes":[{"code":"DBL","name":"雙人房","availableCount":2}]
}
```

The sample is a format example, not actual inventory. `availableCount` must
count rooms sellable for the entire stay, after reservations, holds, and
out-of-service rooms. Return zero only for a confirmed zero. Return a non-2xx
response for an outage. A response older than five minutes is rejected.
NUBO also rejects a mismatched property, dates or adult count.

Configure `NUBO_PMS_AVAILABILITY_URL` and `NUBO_PMS_AVAILABILITY_TOKEN`
on the NUBO server. The existing guest voice tool then queries PMS when the
guest asks, with a four-second timeout. A configured endpoint failure returns
`503 pms_data_unavailable`; it is not presented as sold out. Without these
settings, the existing snapshot path remains in use.

## Booking page

The guest chooses the booking action on the tablet. Set
`NUBO_GUEST_BOOKING_URL` to the PMS's public HTTPS booking page and
`NUBO_GUEST_BOOKING_ENABLED=true` only after a real reservation can be
created there. NUBO then reveals a contextual **前往訂房** button after a
booking request or a positive room lookup. The guest selects the room and
completes details and payment on PMS; NUBO does not create or guarantee a
reservation. The PMS booking page must recheck inventory and final price.

As checked on 2026-11-17, `https://nubosci.ainubohub.com/` labels itself a
local preview. Its `現場住宿／休息` page says booking is unavailable and it
will not create orders or charge. Do not enable this URL until PMS changes
that production behavior and a test reservation has been verified.
