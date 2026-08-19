# Terra compliance confirmation — email draft

Not sent by me. Copy into your email client (or your Terra dashboard's
support channel, if you have a more direct contact once you're signed up)
and send when ready. Once sent, this satisfies the non-dev action item in
`specs/v3-build-spec.md`'s Phase 2 section.

**To:** privacy@tryterra.co (Terra's listed privacy/compliance contact —
swap for a dedicated contact if your account has one)
**Subject:** Compliance confirmation request — pseudonymized-only integration

---

Hi Terra team,

I'm building Gamma, a small coaching-platform product, and I'm about to
integrate Terra as our health-data layer (Mobile SDK for Apple
Health/Google Health/Samsung Health, Web API for Fitbit/Garmin/
MyFitnessPal). Before any real client connects a wearable or health
account, I want written confirmation that our architecture is compliant
with your terms, rather than relying on our own reading of your ToS.

**Our architecture:** every client in our system gets an opaque, randomly
generated internal UUID at account creation. This UUID — and only this
UUID — is the `reference_id` we pass to Terra when initializing a
connection (Mobile SDK `initConnection()` or the Web API auth widget). We
never send Terra a client's name, email, phone number, or any other
directly identifying field, in any API call, in any payload, for any
provider. The real client record (name, contact info, coach assignment)
lives only in our own database, keyed by that same internal UUID — Terra
never sees the mapping back to a real person.

Data types we'd be syncing through this pipeline: steps, sleep, body
weight, active/total calories, and workout sessions, via
Apple Health/Google Health/Samsung Health (Mobile SDK) to start.

**What we'd like confirmed in writing:**

1. Is this pseudonymized-reference-ID-only architecture (no name, email, or
   other direct identifiers ever transmitted) compliant with your current
   standard-tier terms of service, or does it require an Enterprise
   agreement / BAA regardless of pseudonymization?
2. If a BAA is required or recommended even for a pseudonymized-only
   integration, what's the process to put one in place, and does that
   change availability on our current plan?
3. Are there any additional requirements on our end — consent language,
   data retention limits, deletion/right-to-be-forgotten handling — that
   we should build into our client-facing consent flow before the first
   real connection?

We're a small team (a handful of real users to start, scaling gradually),
and want to get this right before anyone connects a real account. Happy to
hop on a call if that's easier than email.

Thanks,
Vik Williamson
williamson.vik@gmail.com
