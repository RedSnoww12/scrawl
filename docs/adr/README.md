# Architecture decisions

Each file here records one decision that shapes Scrawl: what we chose, why, and what it costs. They are the rules a change has to respect. If a change needs to break one, write a new record that replaces it instead of quietly working around it.

| #                                              | Decision                                                | Status   |
| ---------------------------------------------- | ------------------------------------------------------- | -------- |
| [0001](0001-record-architecture-decisions.md)  | Record architecture decisions                           | Accepted |
| [0002](0002-engine-free-of-react.md)           | The canvas engine stays free of React                   | Accepted |
| [0003](0003-storage-behind-repo-interface.md)  | All storage goes through the `Repo` interface           | Accepted |
| [0004](0004-access-control-in-the-database.md) | Access control lives in the database                    | Accepted |
| [0005](0005-versioned-saves-and-merge.md)      | Versioned saves and a shape-by-shape merge              | Accepted |
| [0006](0006-realtime-channels-one-sender.md)   | Live collaboration on private channels, one sender each | Accepted |
| [0007](0007-board-data-is-untrusted.md)        | Board data is untrusted                                 | Accepted |
| [0008](0008-exact-dependency-versions.md)      | Exact dependency versions, few dependencies             | Accepted |
| [0009](0009-semver-releases.md)                | Semantic versions, released from the changelog          | Accepted |
| [0010](0010-quality-gates-in-ci.md)            | Quality and security checks in CI                       | Accepted |

## Writing a new one

Copy [template.md](template.md) to the next number, for example `0010-short-title.md`, fill it in, add it to the table above, and open a pull request labelled `documentation`. Discuss it in an issue first if it changes how existing code must work.

A record is never edited to say something different later. When a decision changes, write a new record, set the old one's status to `Superseded by 00NN`, and update the table.
