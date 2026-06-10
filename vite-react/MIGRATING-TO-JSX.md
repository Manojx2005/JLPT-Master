# Converting this project to JSX

This project is a **real React app built with Vite** — npm dependencies, ES modules,
a dev server, and a production build. The component files in `src/` currently use
`React.createElement(...)` rather than JSX.

**That is still React.** JSX is just nicer syntax that the build compiles down to the
exact `createElement` calls you already have here. So you can convert at your own pace
without changing how the app behaves.

## Why it wasn't auto-converted for you

JSX only becomes valid JavaScript *after* Vite/Babel compiles it. The safe way to convert
~5,500 lines is to do it **with the dev server running**, so any mistake shows up
instantly in the browser/terminal. A blind bulk rewrite with no build to check against
tends to introduce hard-to-find errors. So the recommended path below is incremental.

## The pattern

`createElement(type, props, ...children)` becomes `<type ...props>children</type>`.

**Before (`createElement`):**
```js
function Toast(props) {
    if (!props.visible) return null;
    return createElement('div', { className: 'toast' }, props.message);
}
```

**After (JSX):**
```jsx
function Toast(props) {
    if (!props.visible) return null;
    return <div className="toast">{props.message}</div>;
}
```

More mappings:

| `createElement` | JSX |
|---|---|
| `createElement('div', null, 'hi')` | `<div>hi</div>` |
| `createElement('div', { className: 'x' }, child)` | `<div className="x">{child}</div>` |
| `createElement(MyComp, { value: 5 })` | `<MyComp value={5} />` |
| `createElement('ul', null, items.map(...))` | `<ul>{items.map(...)}</ul>` |
| `cond ? createElement(...) : null` | `{cond && (<.../>)}` |

Tip: in JSX, plain text is written directly, but **any JavaScript expression** (variables,
`.map()`, ternaries, function calls) goes inside `{ }`.

## Recommended workflow

1. `npm install`
2. `npm run dev` and open the local URL it prints.
3. Pick **one** component (start small — `Toast`, `ThemeToggle`, `AudioButton`).
   Convert it to JSX. Save. The dev server hot-reloads; if you broke something the
   error appears immediately with a line number.
4. Repeat, one component at a time. Commit after each working conversion.

Work from the leaves up: convert the small shared components in `01-core.jsx` first,
then the tab components that use them.

## Optional: codemod

There are community codemods that attempt `createElement → JSX` automatically (search npm
for "createelement to jsx"). They can save typing but their output **quality varies** —
always run `npm run dev`/`npm run build` afterward and review the diff before committing.
Doing it by hand a few components at a time is slower but far more reliable, and it's
great React practice.
