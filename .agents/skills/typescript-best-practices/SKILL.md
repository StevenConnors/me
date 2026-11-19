---
name: typescript-best-practices
description: TypeScript rules for this repo - make illegal states unrepresentable, parse external data with Zod at the boundary, no casts. Use when writing or editing any .ts or .tsx file.
---

# TypeScript best practices

Adapted from [pstack](https://github.com/cursor/plugins/tree/main/pstack) (MIT). Examples: `references/patterns.md`.

## Principles
- **Make the compiler reject impossible states**, mismatched primitives and unhandled variants.
- **Validate at boundaries, trust inside.** Request bodies, query params, `JSON.parse`, env vars, Cloudinary/NextAuth payloads and MongoDB documents are `unknown` until parsed. Parse once where they cross in; do not re-validate or add redundant null checks inside.
- **One schema owns each shape.** Use the Zod schemas in `lib/<domain>/schemas.ts` and derive types with `z.infer`. Do not keep a schema, a parallel interface and a hand-written guard that can drift.
- **Keep business logic pure.** Route handlers and Server Components stay thin: parse input, check auth (`lib/auth/admin.ts` for admin routes), call a `lib/` function, shape the response.

## Rules
| Rule | Summary |
|------|---------|
| Discriminated unions | Model variants with a `kind` literal, not a bag of optional fields plus booleans. |
| Branded types | Brand primitives that are easy to mix up (`& { readonly __brand: "X" }`). A brand comes from a verifying guard or parser, never from `as`. |
| Constructive modeling | Build the shape so the illegal value can't exist: `[T, ...T[]]` for non-empty, `start` + `duration` for a range. |
| Simplest total type | Keep `T[]` while every operation stays total. Strengthen only where the loose type forces `!`, a cast or a "should never happen" throw. |
| `unknown` over `any` | External data is `unknown`. |
| Schemas before guards | Use Zod (`parse`, or `safeParse` when failure is an expected branch) before writing a property-by-property guard. |
| No `as` casts | Cast only after validation. When removing one, find why inference fails: missing discriminant, too-wide source type, or an unparsed boundary. |
| Narrowing order | Discriminant switch > `in` > `typeof`/`instanceof` > type guard > `as`. |
| Honest type guards | A guard must verify its claim. Name it `isX`/`hasX`. |
| Exhaustiveness | `const _exhaustive: never = x;` in `default` arms. |
| `satisfies` over `as` | Validates without widening literals. |
| Derived types | Reach for `Pick`/`Omit`/`Parameters`/`ReturnType`/`Awaited`/`typeof` before declaring a new interface. |
| Object args | Pass an options object when a function has several parameters of the same type. |
| Real tests | Don't mock what you can run; prefer the disposable Mongo and Playwright (see `e2e-failure-first`). |
| No `console.log` | Not in shipped code. |
