# backx validator

Watches BackX Position Managers on Robinhood Chain and liquidates / fills take-profits in batches. Works from the
chain alone. Setup, ranks, hosts, funding and the optional health API: `../docs/KEEPERS.md`.

    npm ci
    npm run keygen -- <keeper-id>     # prints secret env lines + the public line for Railway KEEPERS
    node src/index.js                 # needs the env described in docs/KEEPERS.md
