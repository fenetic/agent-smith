# Application Architecture — Tech Decisions

> Cross-cutting technical decisions for building [Work Items 01–08](work-items/).
> The work-item designs settle *what* each layer does and how the layers relate;
> this document settles the *substrate* they are built on — runtime, language
> config, libraries, test strategy, and the one architectural seam the designs
> deliberately left to implementation. It adds no behaviour of its own.

## The shape of the system

Seven modules in one package, in a strict dependency line. Nothing points
backwards:

```
      01 registry ──▶ 02 retrieval ──┬──▶ 03 mcp        (external consumer, stdio)
                                     └──▶ 04 agent      (internal consumer, in-process)
                                              ▲   │
                                              │   ▼
                                     06 observability   05 guardrails
                                              ▲
                                          07 eval ──▶ runs 04 end-to-end
```

Two consumers, one source of truth — the project's central claim, made
structural. 03 and 04 are peers over 02; neither depends on the other.

## Runtime and package

**Node 22 (LTS), ESM, npm, one package.**

- **ESM** (`"type": "module"`), because the MCP SDK, the Anthropic SDK, and
  Vitest are all ESM-first, and the stdio server is a plain Node entrypoint.
- **One package, not a workspace.** The module boundaries that matter are
  already enforced by the dependency line above and by TypeScript. Splitting
  into workspaces would add publishing and linking machinery to defend a
  boundary we are not actually publishing across — a cost with no payoff inside
  a weekend.

### Decision: no build step

**`tsc` typechecks (`noEmit`); `tsx` runs. There is no `dist`.**

Nothing consumes compiled output. The MCP server (03) is launched by an MCP
client config pointing at a command — `npx tsx src/mcp/index.ts` serves that as
well as a compiled binary would. The eval harness (07) is a local command.
Nothing is published. Vitest transforms sources through its own pipeline and
never invokes `tsc`.

Carrying a build anyway would mean `rootDir`/`outDir`, a second tsconfig to keep
tests out of the output, and a step to copy 01's JSON data into `dist` beside
the code that reads it — machinery whose only consumer would be itself. Cutting
it removes all four. `npm run typecheck` still proves the whole tree compiles,
which is the property we actually wanted from `tsc`; dropping `rootDir` also
means `vitest.config.ts` is covered by it rather than sitting outside.

*If this ever needs reversing* (publishing the MCP server as a real binary, say),
it is `noEmit` → `rootDir`/`outDir` plus a data-copy step — minutes, not a
rewrite.

## Language config

**TypeScript 7, strict, plus three checks beyond `strict`:**

| Flag | Why it is on |
|------|--------------|
| `noUncheckedIndexedAccess` | 02 resolves versions by array index (`meta.versions`). This forces the miss case to be handled rather than trusted. |
| `exactOptionalPropertyTypes` | 02's whole safety claim is about *field presence* — `removedIn?` absent must not be conflatable with `removedIn: undefined`. |
| `verbatimModuleSyntax` | Keeps type-only imports erased and the emitted ESM honest. |

This strictness is on-brand rather than incidental. 02's claim is that
"reaching for a value on a `removed` result is a compile error" — that claim is
only as strong as the compiler settings behind it.

*Note:* TypeScript 7 is the native (Go) compiler, current stable. It is a
drop-in for `tsc`; Vitest transforms via its own pipeline and never invokes it,
so the blast radius if it misbehaves is typechecking and `dist` only.

## Libraries

| Concern | Choice | Why |
|---------|--------|-----|
| Schema + types | **Zod 4** | 01 requires the schema to be the source of the TypeScript types (`z.infer`), and the MCP SDK (03) already takes Zod for tool input schemas. One library spans both seams instead of two. |
| MCP | **`@modelcontextprotocol/sdk` 1.29** | The reference implementation; stdio transport per 03. Its `InMemoryTransport` also gives 03's parity test a real client with no subprocess. |
| Model | **`@anthropic-ai/sdk` 0.111** | Messages API tool-use loop per 04 — behind a port, see below. |
| Test runner | **Vitest 4** | Committed. Two projects, see below. |
| Lint + format | **Biome 2.5** | One tool, one config, both jobs. |

### Decision: a manual tool-use loop, not the SDK's tool runner

The Anthropic SDK ships a tool runner that would drive 04's loop for us. We are
not using it, for two reasons:

1. **The loop is the deliverable.** The brief's claim is a compliance agent
   *built from scratch*; handing the reason → tool → observe → reason cycle to a
   library would hollow out exactly the thing being demonstrated.
2. **05 structurally depends on us minting the evidence.** The guardrail works
   because `RetrievalRef`s are minted *by the harness when a tool truly runs*,
   never by the model. That property has to be ours to guarantee.

The cost — writing the `stop_reason === "tool_use"` loop by hand — is small, and
it is the part of the code most worth showing.

## The one new seam: a `ModelClient` port

The work-item designs stop at "04's loop runs over the Messages API." Building
it under TDD forces the question they left open: **what does a red-green cycle
run against?** A loop that reaches the network cannot be unit-tested quickly,
deterministically, or without a key.

So `loop.ts` depends on a narrow port, not on the Anthropic SDK:

```
ModelClient
  createMessage(request): Promise<Response>   // one turn, nothing more
```

- **Production** — a thin adapter wrapping `@anthropic-ai/sdk`. It is the only
  file in the repo that imports that SDK.
- **Tests** — a scripted fake returning canned `tool_use` / `text` blocks. The
  loop's real logic (evidence minting, `groundedIn` population, the iteration
  cap, terminating) becomes testable in milliseconds, offline, with no key.

This is the same shape as the seams the designs already use: 06 reaches into the
loop through an observer hook the loop owns; 04 reaches the model through a port
the loop owns. Dependencies point inward in both cases.

*Rejected alternative:* recording HTTP fixtures (msw/nock). It exercises the
real SDK, but the fixtures are re-recorded every time a prompt changes — and the
prompt (04's `prompt.ts`) is the thing we will iterate on most. The fake tests
our loop; fixtures would mostly test Anthropic's serializer.

## Model selection: configurable, decided by eval

04 names "a capable Claude model" and leaves selection to implementation. Rather
than assert an answer, we make it a config value defaulting to
**`claude-opus-4-8`** (adaptive thinking, `effort: high` — the ambiguous-case
judgment is precisely the reasoning-heavy work that tier is for), and let
**07 settle it empirically**.

This is the eval harness earning its keep beyond the README: 07 already scores
disagreements by *safety* (escalation vs confident-wrong), so pointing it at two
models answers "is the cheaper tier good enough here?" with a measurement rather
than an opinion. That is a better story than either choice made on instinct.

## Test strategy

**Two Vitest projects, split by whether a test may touch the network.**

| Project | Files | Needs a key | Runs in CI |
|---------|-------|-------------|------------|
| `unit` (default) | `*.test.ts` | No | Yes |
| `integration` | `*.integration.test.ts` | Yes | No |

`npm test` runs `unit` only — so the TDD loop stays fast and offline, and CI
needs no secret. Everything in 01, 02, 03, 05, and 06 is unit-testable outright:
they are pure functions and in-memory data by design. Only 04's end-to-end
validation ("a real run produces a `Report`") genuinely needs the API, and that
is one test, not a suite.

**The eval harness (07) is not a test.** It is a command (`npm run eval`) that
produces a report. Tests assert; eval measures a nondeterministic system and
reports what it found. Conflating them would make the suite fail on model
variance, which is exactly the wrong signal.

## Deliberate scope cuts (feeds the README)

- **No workspace/monorepo split** — module boundaries are enforced by the
  dependency line and the compiler, not by package publishing.
- **No build/bundle step** — `tsx` runs sources directly; nothing is published
  or shipped as an artifact.
- **No HTTP/remote transport** — stdio only; remote is the 09 stretch.
- **No auth on any surface** — named as a known gap, per the brief.
- **Synthetic registry data committed to the repo** — no ingestion pipeline,
  no scraping, no Figma.
