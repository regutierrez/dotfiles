# Selected TypeScript and Effect Standards

Load this reference only when the user or repository explicitly selects stricter TypeScript or Effect standards. Otherwise use the ordinary TypeScript guidance and repository conventions.

Inspect the installed TypeScript and Effect versions and established repository patterns before applying a rule. Configured lint and type checks are policy; a preferred Effect idiom is not automatically a correctness defect.

When Effect is selected, trace:

- runtime input through the repository's Schema boundary before typed internal use;
- expected failures through the project's tagged error and Cause conventions;
- service requirements and Layer construction from declaration to composition root;
- resource acquisition through Scope and finalization on success, failure, and interruption;
- forked fiber ownership, interruption, and observed failure;
- retry schedules, bounds, idempotency, and repeated side effects;
- stream backpressure, shutdown, and partial consumption;
- test services such as clocks and layers through the repository's established test seams.

Treat a service tag as the identity of a capability, not automatically as its concrete implementation or construction policy. Let requirements remain visible until the composition root supplies them. When a module exposes both an unassembled Layer and a convenient assembled Layer, preserve unresolved external requirements in the former and provide only dependencies the module actually owns in the latter.

Choose `Layer.succeed`, `Layer.sync`, or `Layer.effect` according to whether construction is a value, synchronous acquisition, or effectful acquisition. Acquire stable dependencies during Layer construction; read request- or fiber-scoped context inside service methods when its lifetime is per operation. Tests may replace the service with a faithful in-memory Layer or a focused local fake; do not require one canonical Layer export shape for every capability.

Prefer ordinary TypeScript when Effect adds no ownership, failure, concurrency, resource, or composition value. Do not require a Layer, tagged error, Schema, branded type, or Effect wrapper for every function or value.

`installing-anti-slop-ts` owns installation and migration of optional Oxlint policy. This reference may interpret already-configured diagnostics but does not install or silently enable them.
