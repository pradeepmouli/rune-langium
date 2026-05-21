# @rune-langium/git-sync-engine

A generic, framework/FS/remote-agnostic two-way git sync engine built over [isomorphic-git](https://isomorphic-git.org/). It implements a debounced commit → fetch → fast-forward-or-merge → push loop with a pluggable conflict policy, so any host environment (browser OPFS, Node.js `fs`, or a virtual in-memory FS) can wire in its own storage, HTTP transport, and conflict resolution strategy without taking a hard dependency on any particular runtime or UI framework.
