<!-- pulse-review -->

## Pulse review

**WARN** | Intent: 85% | Risk: LOW

Reviewed commit: offline-demo

Coverage: All supplied patches included; surrounding context is selective

### PR value
Example: simplify a user lookup.

Avoids maintaining a manual search loop.

**Who benefits:** Developers maintaining user lookup.

**Issue alignment:** No linked issue supplied.

### Reasoning
Illustrative suggestion; verify duplicate-ID and missing-user behavior.

### Simplify code
- Use Array.find when the intended behavior is to return the first matching user.

### Dependency advice
- No new dependency needed.

### Affected features
- User lookup callers may rely on undefined when no match exists.

### Suggested tests — NOT RUN by Pulse
- Add cases for an existing user, a missing user and duplicate IDs.

### Suggested code fixes
**src/users.js:10-10**

Expresses first-match intent directly.

Before:
```
let user = users.filter(u => u.id === id)[0]
```

Suggested replacement (not applied or tested):
```
const user = users.find(u => u.id === id)
```

### Existing CI evidence
- Demo only — no tests executed.

### View suggestions in CMD / terminal
From your installed Pulse checkout:
```text
node src/cli.js --local .
```
This requests a fresh review. AI suggestions are advisory; review them before applying. Suggested commands are not automatically executed.
