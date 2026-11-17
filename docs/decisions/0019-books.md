# Books: private shelves and page progress

Books joins the existing apps at `/books`, with the same authentication, shell, themes and URL navigation. The three shelves are Want to Read (the default route), Currently Reading and Finished. Search uses Open Library's work catalogue; a work can appear only once per user's shelves. Manual entries support books absent from the catalogue.

Each user's books live in PostgreSQL, deleted with their account and included in Download my data. Migration 025 only adds a table and indexes. Page counts are optional and editable because editions differ. Want to Read resets progress to zero, Finished fills the known page count, and reaching the last page moves a reading book to Finished. Counts cannot be negative or exceed the total. Removal uses the shared Undo toast.

Search runs on the server with authentication, rate limiting, a timeout and an hour's cache. Covers load from Open Library; Privacy describes the external requests. No API key is required. Cached shelves can be read offline; changes require a connection and report failures without claiming they were saved. Reading goals and history are outside this release's scope.
