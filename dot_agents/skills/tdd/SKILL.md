---
name: tdd
description: "Runs advanced test-driven development in repeated vertical slices. Use when the user asks for TDD, red-green-refactor, tracer bullets, or one-test-at-a-time implementation."
---

# Test-Driven Development

Use this skill for a deliberate sequence of one failing test, one minimal implementation, and one safe refactor at a time. Ordinary implementation already requires falsifiable red-before-green proof; this skill adds repeated tracer-bullet slicing.

When exploring the codebase, read `CONTEXT.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.

Use `pragmatic-engineering` for caller-visible proof and language/framework mechanics. When the interface or seam itself is the design problem, load `codebase-design` before fixing the test shape.

Do not write all tests and then all implementation. Each test is a tracer bullet informed by the previous cycle:

1. Choose one caller-visible behavior at one established seam.
2. Derive the expected result independently from the implementation.
3. Write the narrowest test that distinguishes the intended behavior from a plausible wrong implementation.
4. Run it and confirm that it fails for the expected reason, not setup noise.
5. Write only enough production code to satisfy that behavior.
6. Run the focused test and relevant nearby checks.
7. Refactor only while green, preserving observable behavior.
8. Let the result determine the next slice.

## Rules of the loop

- **Red before green.** Never count a test as evidence unless it was observed failing for the reason the production change should correct.
- **One slice at a time.** Do not anticipate later tests or implement horizontal layers ahead of demonstrated behavior.
- **Refactor while green.** Keep refactoring separate from behavior changes inside a cycle and rerun the proof after each structural edit.
