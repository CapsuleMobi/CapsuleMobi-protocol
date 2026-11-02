# CAPSULE

One pill. Every move across Solana, in view.

[![Live site](https://img.shields.io/badge/live-capsule.mobi-171717)](https://capsule.mobi)

- **Chain:** Solana
- **Contract address:** pending

## Overview

CAPSULE is a live market board for Solana. It lists the busiest tokens by 24h volume and pins its own token as row one once the mint address is published.

## Features

- Live board: price, 24h change, volume and liquidity for ten rows
- Own-token row pinned on top, with a branded placeholder until the address is stated
- Scrolling ticker fed by the same data
- Copy-to-clipboard for the mint address and for every row
- Polling every 60 seconds, paused while the tab is hidden
- Reduced-motion support throughout

## Links

- Site: https://capsule.mobi
- X: pending
- GitHub: pending
- Whitepaper: [docs/whitepaper.md](docs/whitepaper.md)

## Develop

```bash
npm run build
npm run gates
npm run serve
```

The deployable output is `dist/`.
