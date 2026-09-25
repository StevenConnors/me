Use GitHub stacks to keep PRs manageable and stackable. Each PR should be kept to change or improve a single aspect of the overall work
Prior to opening a PR, ensure all tests and linters are green before opening the PR.

- NEVER write unit tests after you write code. 
- Highly prefer E2E tests as the sole testing mechanism. Use them to verify complex features work. At the end of E2E tests, produce a verifiable and repeatable artifact. 
- If you must test a system in isolation, FIRST write all the ways it could fail, THEN write the code.

