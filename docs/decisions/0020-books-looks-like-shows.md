# 0020 — Books looks like Shows, with Shows' styles

**Decided:** unreleased.

**Why:** both are a library of things with covers, a status and progress, found in a catalogue and shared with friends; Books had a look of its own (cards with buttons, a form for everything) that made the same actions work differently in the two apps.

**What it is:** Books has Shows' tabs (Library, Discover, Profile), poster grids and sideways rows, + and the chooser on a cover, quick actions, a title-style panel and a search as you type. Its components use `Shows.module.css` and Shows' generic hooks (exported from `components/shows/`) rather than copies; `Books.module.css` has only what is Books' own. A shelf takes the look of the Shows status it is like (Want to Read of Planned, Reading of Watching, Finished of Completed).

**Costs:** a change to Shows' styles or those hooks changes Books too, so both apps' tests (`books.spec.ts`, `views.spec.ts`) need running after one; the Shows class names (`watching`, `completed`) show up in Books' code.
