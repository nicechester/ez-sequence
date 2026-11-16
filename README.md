# ez-sequence

**Live: https://nicechester.github.io/ez-sequence/**

Mermaid sequence diagrams rendered 100% in the browser, with the participant
row pinned to the top while you scroll a tall diagram.

One static `index.html`, no build step, no server. Open it from disk or host
it on GitHub Pages.

## Features

- CodeMirror 6 editor with Mermaid syntax highlighting, line numbers,
  bracket matching, search (`Cmd/Ctrl+F`) and full undo history. Falls back
  to a plain textarea if the editor modules cannot be loaded.
- Auto-renders as you type, or press `Ctrl/Cmd+Enter`.
- **Sticky participant header.** The participant boxes (and `box` group
  labels) stay visible while messages scroll underneath. The diagram title
  scrolls away normally.
- Zoom: `+`, `−`, Fit, 1:1, or `Ctrl/Cmd + mouse wheel` over the diagram.
- **Full screen**: shows only the diagram. Esc exits; a small floating bar
  offers zoom and Exit while full screen.
- Mermaid themes: auto (follows system dark mode), default, neutral, forest,
  dark, redux variants.
- Open any text file with the Open button, or **drop a file anywhere on the
  page**. Dropping selected text (dragged out of an editor) works too. For
  Markdown, the first ```` ```mermaid ```` block is used.
  Note: dragging a file from the VS Code or Cursor explorer only carries the
  file's path, which a web page cannot open. Drag from Finder/Explorer, or
  drag the selected text instead.
- Download the rendered SVG.
- **Copy link**: puts the diagram text, compressed, into the URL hash so you
  can share a diagram as a plain link. Nothing is sent anywhere.
- Source, theme, zoom and toggles persist in `localStorage`.

## Privacy

Rendering happens in your browser. The only network requests are for the
libraries themselves, all pinned to exact versions: Mermaid from cdnjs, and
CodeMirror plus its Mermaid grammar from esm.sh. Your diagram text never
leaves the page.

### Fully offline

Mermaid: vendor it and the page falls back to it automatically if the CDN
fails (or point the `<script src>` at the local copy to make it primary).

```sh
curl -L -o vendor/mermaid.min.js \
  https://cdnjs.cloudflare.com/ajax/libs/mermaid/12.3.0/mermaid.min.js
```

CodeMirror: the import map in `index.html` lists every module URL. Download
each one into `vendor/` and change the map entries to the local paths. If
the editor modules are unavailable, the page still works with a plain
textarea.

## PlantUML files

Mermaid cannot render PlantUML, but the page converts PlantUML *sequence*
diagrams to Mermaid for you:

- Opening or dropping a `.puml` / `.plantuml` / `.pu` / `.iuml` / `.wsd`
  file, or any text containing `@startuml`, converts it on the way in.
- The **PlantUML → Mermaid** button converts whatever is in the editor, in
  place. Undo with `Cmd/Ctrl+Z`.

Covered: participant declarations with aliases and types (`actor`,
`database`, `queue`, `boundary`, `control`, `entity`, `collections`),
`box`, all message arrows (solid/dashed, thin `->>`, cross `->x`,
bidirectional), `++`/`--`/`**`/`!!` shorthands, `activate`/`deactivate`/
`return`, `create`/`destroy`, `alt`/`else`/`opt`/`loop`/`par`/`break`/
`critical`/`group`, single- and multi-line notes, `ref`, `== dividers ==`
(as a note across all participants), `...delays...`, `autonumber`, `title`
and comments. Presentation lines (`skinparam`, `hide footbox`, `!theme`, …)
are dropped. Anything not understood is kept as a `%% TODO plantuml:`
comment so you can fix it by hand.

The converter is `puml2mermaid.js`, a dependency-free script that also runs
in Node (`require('./puml2mermaid.js')(text)`).

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
