# Approving a Refund Request deletes the enrollment

Access to a course is decided solely by whether an enrollment row exists, and many loaders (several with copy-pasted queries) read enrollments directly. So when an Admin Approves a Refund Request we delete the learner's enrollment in the same transaction that marks the request Approved, rather than adding a "revoked" flag that every enrollment query would have to remember to filter. The Approved Refund Request row is the historical record of what happened; lesson progress lives in its own table and is deliberately kept, so it reappears if the learner buys the course again.

## Consequences

- The original `enrolledAt` and `completedAt` for that enrollment are lost on Approval.
- Re-purchase works through the normal purchase flow with no special case, because the "already enrolled" guard no longer fires.
- Anything that needs "was this learner ever enrolled?" must look at Purchases and Refund Requests, not enrollments.
