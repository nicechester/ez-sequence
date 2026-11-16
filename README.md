# ez-sequence

**Live: https://nicechester.github.io/ez-sequence/**

Mermaid sequence diagrams rendered 100% in the browser, with the participant
row pinned to the top while you scroll a tall diagram.

One static `index.html`, no build step, no server. Open it from disk or host
it on GitHub Pages.

## Features

- Editor on the left, diagram on the right. Auto-renders as you type, or
  press `Ctrl/Cmd+Enter`.
- **Sticky participant header.** The participant boxes (and `box` group
  labels) stay visible while messages scroll underneath. The diagram title
  scrolls away normally.
- Zoom: `+`, `−`, Fit, 1:1, or `Ctrl/Cmd + mouse wheel` over the diagram.
- **Full screen**: shows only the diagram. Esc exits; a small floating bar
  offers zoom and Exit while full screen.
- Mermaid themes: auto (follows system dark mode), default, neutral, forest,
  dark, redux variants.
- Open any text file with the Open button, or **drop a file anywhere on the
  page**. For Markdown, the first ```` ```mermaid ```` block is used.
- Download the rendered SVG.
- **Copy link**: puts the diagram text, compressed, into the URL hash so you
  can share a diagram as a plain link. Nothing is sent anywhere.
- Source, theme, zoom and toggles persist in `localStorage`.

## Privacy

Rendering happens in your browser. The only network request is the Mermaid
library itself, loaded from cdnjs with a pinned version. Your diagram text
never leaves the page.

### Fully offline

To remove the CDN dependency, vendor Mermaid:

```sh
curl -L -o vendor/mermaid.min.js \
  https://cdnjs.cloudflare.com/ajax/libs/mermaid/12.3.0/mermaid.min.js
```

The page already falls back to `vendor/mermaid.min.js` if the CDN fails. To
make the vendored copy the primary source, point the `<script src>` in
`index.html` at `vendor/mermaid.min.js`.

## Mermaid sequence syntax cheat sheet

```
sequenceDiagram
  autonumber
  actor User
  participant Web as Web App
  box rgb(232,240,254) Backend
    participant API
    participant DB
  end
  User->>Web: solid arrow
  Web->>+API: activate API
  API->>DB: query
  DB-->>API: dashed reply
  API-->>-Web: deactivate API
  Note over Web,API: a note
  alt success
    Web-->>User: ok
  else failure
    Web-->>User: error
  end
  loop every minute
    Web->>API: poll
  end
```

Full reference: https://mermaid.js.org/syntax/sequenceDiagram.html

## Publish on GitHub Pages

```sh
git add .
git commit -m "ez-sequence: Mermaid sequence viewer with sticky header"
git remote add origin git@github.com:nicechester/ez-sequence.git
git push -u origin main
```

Then in the repo: Settings → Pages → Source *Deploy from a branch*,
branch `main`, folder `/ (root)`. The site appears at
https://nicechester.github.io/ez-sequence/.

## How the sticky header works

1. Mermaid marks each lifeline as `<line class="actor-line">`. The
   participant row ends where the topmost lifeline starts.
2. The row starts at the topmost shape that lies entirely above that line.
   The title is a bare `<text>` directly under the SVG root, so it is
   skipped; `box` labels sit inside a `<g>` and are kept.
3. The SVG is cloned, the clone's `viewBox` is cropped to that band, and the
   clone sits in a `position: sticky` element placed exactly over the
   original row. Before scrolling, both draw the same pixels, so nothing
   looks duplicated. Once you scroll, the clone pins to the top and the
   original slides underneath.

Mermaid scopes its CSS by the SVG element id, so the clone keeps the same
id on purpose.
