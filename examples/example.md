# Example Diagram

Use this file as a quick reference for the expected markdown shape.

```mermaid
flowchart TD
  User[User writes Mermaid] --> File[system-diagram.md]
  File --> Render[render-diagram]
  Render --> Image[diagram.png]
```

The workflow is intentionally small:

1. Edit `system-diagram.md`.
2. Render a fresh image.
3. Archive the old version when you want a snapshot.
