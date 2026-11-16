/*
 * puml2mermaid.js — convert a PlantUML *sequence* diagram to Mermaid `sequenceDiagram` syntax.
 *
 * Line-based and best-effort. Everything it understands is translated; declarations, messages,
 * activation (explicit, ++/-- shorthand and `return`), create/destroy, alt/else/opt/loop/par/break/
 * critical/group, notes (single and multi-line), ref, dividers, boxes, autonumber and title.
 * Presentation-only lines (skinparam, hide, !theme, ...) are dropped. Anything else is kept as a
 * `%% TODO plantuml:` comment so nothing is lost silently.
 *
 *   const { text, warnings, skipped } = pumlToMermaid(source);
 *
 * Works in the browser (window.pumlToMermaid) and in Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.pumlToMermaid = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TYPES = new Set(['participant', 'actor', 'boundary', 'control', 'entity', 'database', 'collections', 'queue']);
  const DROP = /^(@startuml|@enduml|skinparam\b|skin\b|hide\b|show\b|!theme\b|!pragma\b|!include\b|!define\b|!\$|scale\b|newpage\b|left to right direction|top to bottom direction|mainframe\b|header\b|footer\b|caption\b|legend\b|end ?legend\b|end ?header\b|end ?footer\b|autoactivate\b|\|\|\|?|\|\|\d+\|\|)/i;

  // CSS color names PlantUML and Mermaid share (PlantUML writes them as #Name).
  const sanitizeAlias = (s) => (s.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') || 'P');
  const escText = (s) => s.replace(/\\n/g, '<br/>').replace(/;/g, '#59;').trim();
  const cssColor = (c) => {
    if (!c) return '';
    c = c.replace(/^#/, '');
    if (/^[0-9a-f]{6}$/i.test(c)) return `rgb(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)})`;
    if (/^[0-9a-f]{3}$/i.test(c)) return `rgb(${parseInt(c[0] + c[0], 16)},${parseInt(c[1] + c[1], 16)},${parseInt(c[2] + c[2], 16)})`;
    return /^[A-Za-z]+$/.test(c) ? c : '';
  };

  function pumlToMermaid(src) {
    const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
    const body = [];                 // output statements (after the header)
    const warnings = [];
    let skipped = 0;
    let title = null;
    let autonumber = false;

    const aliasByName = new Map();   // display or raw id -> Mermaid alias
    const declared = new Set();      // aliases that have a declaration line emitted
    const declLineIdx = new Map();   // alias -> index in body of its declaration (for `create`)
    const order = [];                // aliases in order of appearance (for dividers)
    const groups = [];               // open group kinds, for else/and/option mapping
    const activations = [];          // { who, caller } for `return`
    let lastMsg = null;              // { from, to, idx }

    const todo = (line, why) => { body.push(`%% TODO plantuml${why ? ' (' + why + ')' : ''}: ${line}`); warnings.push(line); };

    const resolve = (raw) => {
      // Accept `"Display Name"` or an identifier; return the Mermaid alias, declaring on first use if needed.
      const quoted = /^"(.*)"$/.exec(raw);
      const key = quoted ? quoted[1] : raw;
      if (aliasByName.has(key)) return aliasByName.get(key);
      const alias = sanitizeAlias(key);
      aliasByName.set(key, alias);
      if (!declared.has(alias) && quoted && alias !== key) {
        // Quoted name used without a declaration: declare it so the display text survives.
        declared.add(alias);
        declLineIdx.set(alias, body.length);
        body.push(`participant ${alias} as ${escText(key)}`);
      }
      if (!order.includes(alias)) order.push(alias);
      return alias;
    };

    const span = () => (order.length ? `${order[0]},${order[order.length - 1]}` : null);

    let i = 0;
    while (i < lines.length) {
      const raw = lines[i++];
      let line = raw.trim();
      if (!line) { body.push(''); continue; }

      // ---- comments ----
      if (line.startsWith("'")) { body.push(`%% ${line.slice(1).trim()}`); continue; }
      if (line.startsWith("/'")) {
        let s = line.slice(2);
        while (!s.includes("'/") && i < lines.length) { body.push(`%% ${s.trim()}`); s = lines[i++]; }
        body.push(`%% ${s.replace(/'\/.*$/, '').trim()}`);
        continue;
      }

      // ---- multi-line blocks: title / note / ref / legend / header / footer ----
      let m;
      if ((m = /^title\s*$/i.exec(line))) {
        const acc = [];
        while (i < lines.length && !/^\s*end\s*title\s*$/i.test(lines[i])) acc.push(lines[i++].trim());
        i++; title = acc.join(' / '); continue;
      }
      if ((m = /^title\s+(.+)$/i.exec(line))) { title = m[1].trim(); continue; }

      if ((m = /^[hr]?note\s+(left|right)(?:\s+of\s+("[^"]+"|\S+))?(?:\s+#\w+)?\s*$/i.exec(line))
       || (m = /^[hr]?note\s+(over)\s+("[^"]+"|[^#:]+?)(?:\s+#\w+)?\s*$/i.exec(line))) {
        const acc = [];
        while (i < lines.length && !/^\s*end\s*[hr]?note\s*$/i.test(lines[i])) acc.push(lines[i++].trim());
        i++;
        body.push(noteLine(m[1], m[2], acc.join('<br/>')));
        continue;
      }
      if ((m = /^[hr]?note\s+(left|right)(?:\s+of\s+("[^"]+"|\S+))?(?:\s+#\w+)?\s*:\s*(.*)$/i.exec(line))
       || (m = /^[hr]?note\s+(over)\s+("[^"]+"|[^#:]+?)(?:\s+#\w+)?\s*:\s*(.*)$/i.exec(line))) {
        body.push(noteLine(m[1], m[2], m[3]));
        continue;
      }
      if ((m = /^ref\s+over\s+([^:]+?)\s*(?::\s*(.*))?$/i.exec(line))) {
        let text = m[2];
        if (text === undefined) {
          const acc = [];
          while (i < lines.length && !/^\s*end\s*ref\s*$/i.test(lines[i])) acc.push(lines[i++].trim());
          i++; text = acc.join('<br/>');
        }
        body.push(noteLine('over', m[1], `ref: ${text}`));
        continue;
      }
      if (/^(legend|header|footer)\b/i.test(line) && !/:/.test(line)) {
        while (i < lines.length && !/^\s*end\s*(legend|header|footer)\s*$/i.test(lines[i])) i++;
        i++; skipped++; continue;
      }
      if (/^skinparam\b.*\{\s*$/i.test(line)) {           // skinparam block
        while (i < lines.length && !/^\s*\}\s*$/.test(lines[i])) i++;
        i++; skipped++; continue;
      }

      // ---- presentation-only lines ----
      if (DROP.test(line)) { skipped++; continue; }

      // ---- autonumber ----
      if (/^autonumber\b/i.test(line)) {
        if (/^autonumber\s+(stop|resume|inc)/i.test(line)) { skipped++; continue; }
        if (!autonumber) { autonumber = true; body.push('autonumber'); }
        continue;
      }

      // ---- participant declarations ----
      if ((m = /^(participant|actor|boundary|control|entity|database|collections|queue)\s+(.+)$/i.exec(line))) {
        const type = m[1].toLowerCase();
        let rest = m[2].replace(/\s+order\s+\d+/i, '').replace(/\s*<<[^>]*>>/g, '').replace(/\s+#\w+/g, '').trim();
        let display, alias;
        let mm;
        if ((mm = /^"([^"]*)"\s+as\s+(\S+)$/i.exec(rest))) { display = mm[1]; alias = mm[2]; }
        else if ((mm = /^(\S+)\s+as\s+"([^"]*)"$/i.exec(rest))) { alias = mm[1]; display = mm[2]; }
        else if ((mm = /^(\S+)\s+as\s+(\S+)$/i.exec(rest))) { display = mm[1]; alias = mm[2]; }
        else if ((mm = /^"([^"]*)"$/.exec(rest))) { display = mm[1]; alias = sanitizeAlias(mm[1]); }
        else { display = null; alias = rest.split(/\s+/)[0]; }
        const mAlias = sanitizeAlias(alias);
        aliasByName.set(alias, mAlias);
        if (display !== null) aliasByName.set(display, mAlias);
        declared.add(mAlias);
        if (!order.includes(mAlias)) order.push(mAlias);
        const kw = type === 'actor' ? 'actor' : 'participant';
        const meta = (type === 'participant' || type === 'actor') ? '' : `@{ "type": "${type}" }`;
        const as = display !== null && display !== mAlias ? ` as ${escText(display)}` : '';
        declLineIdx.set(mAlias, body.length);
        body.push(`${kw} ${mAlias}${meta}${as}`);
        continue;
      }

      // ---- boxes ----
      if ((m = /^box\s*(?:"([^"]*)"|([^#]+?))?\s*(#\w+)?\s*$/i.exec(line))) {
        const label = (m[1] ?? m[2] ?? '').trim();
        const color = cssColor(m[3]);
        body.push(`box ${color ? color + ' ' : ''}${label || ' '}`.trimEnd());
        groups.push('box');
        continue;
      }
      if (/^end\s*box$/i.test(line)) { if (groups[groups.length - 1] === 'box') groups.pop(); body.push('end'); continue; }

      // ---- groups ----
      if ((m = /^(alt|opt|loop|par|break|critical|group)\b\s*(.*)$/i.exec(line))) {
        let kind = m[1].toLowerCase();
        const label = m[2].trim();
        if (kind === 'group') { kind = 'opt'; }
        groups.push(kind);
        body.push(`${kind}${label ? ' ' + label : ''}`);
        continue;
      }
      if ((m = /^else\b\s*(.*)$/i.exec(line))) {
        const kind = groups[groups.length - 1];
        const kw = kind === 'par' ? 'and' : kind === 'critical' ? 'option' : 'else';
        body.push(`${kw}${m[1].trim() ? ' ' + m[1].trim() : ''}`);
        continue;
      }
      if (/^end\b/i.test(line)) { groups.pop(); body.push('end'); continue; }

      // ---- dividers / delays / spacing ----
      if ((m = /^==+\s*(.*?)\s*==+$/.exec(line))) {
        const s = span();
        if (s) body.push(`Note over ${s}: ${escText(m[1]) || ' '}`); else todo(line, 'divider before any participant');
        continue;
      }
      if ((m = /^\.\.\.(.*?)\.\.\.$/.exec(line)) || /^\.\.\.$/.test(line)) {
        const text = m ? m[1].trim() : '';
        const s = span();
        if (text && s) body.push(`Note over ${s}: ${escText(text)}`); else skipped++;
        continue;
      }

      // ---- activation ----
      if ((m = /^activate\s+("[^"]+"|\S+)/i.exec(line))) {
        const who = resolve(m[1]);
        activations.push({ who, caller: lastMsg && lastMsg.to === who ? lastMsg.from : null });
        body.push(`activate ${who}`);
        continue;
      }
      if ((m = /^deactivate\s+("[^"]+"|\S+)/i.exec(line))) {
        const who = resolve(m[1]);
        const k = activations.map((a) => a.who).lastIndexOf(who);
        if (k >= 0) activations.splice(k, 1);
        body.push(`deactivate ${who}`);
        continue;
      }
      if ((m = /^return\b\s*(.*)$/i.exec(line))) {
        const act = activations.pop();
        if (act && act.caller) { body.push(`${act.who}-->>-${act.caller}: ${escText(m[1]) || ' '}`); lastMsg = { from: act.who, to: act.caller, idx: body.length - 1 }; }
        else if (lastMsg) { body.push(`${lastMsg.to}-->>${lastMsg.from}: ${escText(m[1]) || ' '}`); if (act) body.push(`deactivate ${act.who}`); }
        else todo(line, 'return with nothing to return from');
        continue;
      }
      if ((m = /^create\s+(?:(participant|actor|boundary|control|entity|database|collections|queue)\s+)?("[^"]+"|\S+)(?:\s+as\s+(\S+))?/i.exec(line))) {
        const who = resolve(m[3] || m[2]);
        if (declLineIdx.has(who)) body[declLineIdx.get(who)] = '';   // Mermaid declares at the create statement
        declared.add(who);
        body.push(`create ${m[1] && m[1].toLowerCase() === 'actor' ? 'actor' : 'participant'} ${who}`);
        continue;
      }
      if ((m = /^destroy\s+("[^"]+"|\S+)/i.exec(line))) {
        const who = resolve(m[1]);
        // Mermaid wants `destroy X` *before* the message that ends X; PlantUML puts it after.
        if (lastMsg && (lastMsg.to === who || lastMsg.from === who)) body.splice(lastMsg.idx, 0, `destroy ${who}`);
        else todo(line, 'destroy needs a preceding message to/from that participant');
        continue;
      }

      // ---- messages ----
      // <from> <arrow> <to> [++|--|**|!!] [: text]
      if ((m = /^("[^"]+"|[^\s"<>\-\\\/\[\]:]+)?\s*((?:<<|x<|o<|[<\\\/])?-{1,2}(?:\[[^\]]*\])?-{0,2}(?:>>|>x|>o|[>\\\/xo])?)\s*("[^"]+"|[^\s"<>\-\\\/:+*!\[\]]+)?\s*(\+\+|--|\*\*|!!)?\s*(?::\s*(.*))?$/.exec(line))
          && (m[1] || m[3]) && /-/.test(m[2])) {
        if (!m[1] || !m[3]) { todo(line, 'message to/from outside is not supported'); continue; }
        const arrow = m[2].replace(/\[[^\]]*\]/, '');
        const dashed = arrow.includes('--');
        const leftward = /^(<<|<|x<|o<|\\|\/)/.test(arrow) && !/>[xo]?$/.test(arrow);
        const both = /^<.*>$/.test(arrow);
        const thin = /^<<|>>$/.test(arrow);
        const cross = /^x|x$/.test(arrow);
        let from = resolve(leftward ? m[3] : m[1]);
        let to = resolve(leftward ? m[1] : m[3]);
        let head = both ? (dashed ? '<<-->>' : '<<->>') : cross ? (dashed ? '--x' : '-x') : thin ? (dashed ? '--)' : '-)') : (dashed ? '-->>' : '->>');
        let mark = '';
        const shorthand = m[4];
        if (shorthand === '++') { mark = '+'; activations.push({ who: to, caller: from }); }
        else if (shorthand === '--') { mark = '-'; const k = activations.map((a) => a.who).lastIndexOf(from); if (k >= 0) activations.splice(k, 1); }
        else if (shorthand === '**') { if (declLineIdx.has(to)) body[declLineIdx.get(to)] = ''; body.push(`create participant ${to}`); }
        if (shorthand === '!!') body.push(`destroy ${to}`);
        const text = escText(m[5] || '');
        body.push(`${from}${head}${mark}${to}: ${text || ' '}`);
        lastMsg = { from, to, idx: body.length - 1 };
        continue;
      }

      todo(line);
    }

    function noteLine(where, target, text) {
      where = where.toLowerCase();
      let who;
      if (where === 'over') who = target.split(',').map((s) => resolve(s.trim())).join(',');
      else if (target) who = resolve(target);
      else if (lastMsg) who = lastMsg.to;
      else return `%% TODO plantuml (note without a participant): ${text}`;
      const side = where === 'over' ? 'over' : `${where} of`;
      return `Note ${side} ${who}: ${escText(text) || ' '}`;
    }

    // Assemble: optional front-matter title, then the body with indentation.
    const out = [];
    if (title) out.push('---', `title: ${JSON.stringify(title.replace(/\\n/g, ' '))}`, '---');
    out.push('sequenceDiagram');
    let depth = 1;
    for (const l of body) {
      if (l === '') { out.push(''); continue; }
      if (/^end\b/.test(l)) depth = Math.max(1, depth - 1);
      if (/^(else|and|option)\b/.test(l)) out.push('  '.repeat(Math.max(1, depth - 1)) + l);
      else out.push('  '.repeat(depth) + l);
      if (/^(alt|opt|loop|par|break|critical|rect|box)\b/.test(l)) depth++;
    }
    return { text: out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n', warnings, skipped };
  }

  pumlToMermaid.looksLikePlantUML = (text) => /@startuml/i.test(text) || (!/^\s*sequenceDiagram/m.test(text) && /^\s*\S+\s+-{1,2}>\s+\S+\s*(\+\+|--)?\s*:/m.test(text));

  return pumlToMermaid;
});
