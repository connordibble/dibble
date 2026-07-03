# tokenlock example

`src/globals.css` defines two tokens. `src/Card.tsx` uses a raw Tailwind
palette utility, an arbitrary Tailwind color, and a hardcoded hex that
happens to match a defined token.

```bash
npx dibble tokenlock examples/tokenlock/src
```

Expect: `bg-zinc-900/80` and `border-red-500` flagged as raw palette
utilities, and `#18181B` matched to `var(--color-surface)` by value, with
the file and line where that token is defined.
