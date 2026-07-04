# DTCG Notes For token-drift

token-drift expects W3C Design Tokens Community Group style JSON:

```json
{
  "color": {
    "$type": "color",
    "brand": {
      "500": { "$value": "#1d4ed8" }
    }
  }
}
```

Group `$type` values apply to children unless a child overrides them. Token
paths are flattened by object keys: `color.brand.500`.

Aliases are strings containing one token path:

```json
{
  "color": {
    "brand": {
      "500": { "$type": "color", "$value": "#1d4ed8" }
    },
    "action": {
      "primary": { "$type": "color", "$value": "{color.brand.500}" }
    }
  }
}
```

The checker resolves aliases on both sides before comparing values. A cycle
such as `a -> b -> a` produces `CYCLE` and fails.

CSS custom properties are mapped to the same path shape by default:

```css
--color-brand-500: #1d4ed8;
--color-action-primary: var(--color-brand-500);
```

The first maps to `color.brand.500`; the second maps to
`color.action.primary` and resolves to `color.brand.500`.

Ignore a token only when rollout is intentionally staged:

```json
{
  "color": {
    "old": {
      "$type": "color",
      "$value": "#111111",
      "$extensions": { "token-drift": "ignore" }
    }
  }
}
```

```css
--color-old: #111111; /* token-drift-ignore */
```
