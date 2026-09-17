# Item List

A single-page interactive checklist with collapsible categories, check-off progress, day/night mode, and a per-item priority color.

This is a purely static HTML/JS/CSS project. It can be hosted on GitHub Pages.

Try it out: [https://geraniol.github.io/Pages/ItemList/](https://geraniol.github.io/Pages/ItemList/)

## How it works

- `data.js` is the data source; `index.html` reads it fresh on every load.
- Locally it only stores: checked ids, category's collapsed state, and theme (all in `localStorage`).
- Checked state is matched by `id`; orphan ids are cleaned automatically on load.
- Renaming, recoloring, reordering, or restructuring items is fine - as long as the `id` stays the same, the check state is preserved.

## Data structure

In `data.js`, the data is stored in a single global variable `window.CHECKLIST_DATA`:

- `v` version number, just for reference, not enforced.
- `title` page title; it fills both the browser tab `<title>` and the page top heading.
- `tags` object mapping a priority color (key, one of `red` / `orange` / `yellow` / `green`) to its legend label.
- `categories` array, each:
  - `id` category id (collapse state is stored by it)
  - `name` display name
  - `icon` Lucide icon name (see the map in `index.html`)
  - `items` array, each:
    - `id` item id (checked state is stored by it; changing it loses the check, so keep it stable)
    - `text` item name
    - `tag` priority color, one of `red` / `orange` / `yellow` / `green`

## How to instruct your AI to modify the data

``` Prompt
Modify window.CHECKLIST_DATA in data.js as follows:
(Optional) Set the page title, window.CHECKLIST_DATA.title, to: {{PAGE TITLE}}.
(Optional) Set the legend labels, window.CHECKLIST_DATA.tags, to: red={{RED LABEL}}, orange={{ORANGE LABEL}}, yellow={{YELLOW LABEL}}, green={{GREEN LABEL}}.
Add a category: {{YOUR CATEGORY NAME}} containing items: {{ITEMS}}.
tag colors: only red / orange / yellow / green - pick the most fitting one for each item.
ids: number new items with the category prefix. Never touch existing item ids - changing them will lose their checked state.
Edit data.js only; leave other files alone.
When done, list the items you added and the color you gave each.
```
