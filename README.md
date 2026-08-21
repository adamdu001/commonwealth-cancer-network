# Commonwealth Cancer Research & Patent Network

An interactive country-to-country visualisation of cancer publications, clinical trials, inventions, patents and grants from 2016–2023.

**Website:** <https://adamdu001.github.io/commonwealth-cancer-network/>

The visualiser opens with the Intra-Commonwealth Publications network in Full mode. Global mode remains available and defaults to Core mode.

## Networks

- **Publications** — country connections derived from cancer publications.
- **Clinical Trials** — country connections derived from cancer clinical trials.
- **Inventions** — patent-family inventorship connections.
- **Patents** — patent-family ownership connections.
- **Grants** — country connections derived from cancer research grants.

Only the approved 2016–2023 aggregated matrices are included. Annual matrices and `paper_fl` are not used.

## Run locally

Node.js 22.13 or newer is required.

```bash
npm install
npm run data:build
npm run dev
```

The development address is printed in the terminal. The application and its map use only packaged files; no live map tiles or application server are required.

To preview the exact GitHub Pages build:

```bash
npm run build
npm run preview
```

## Rebuild and verify the data

```bash
npm run data:build
npm run typecheck
npm run lint
npm test
```

The preparation step validates matrix shape, country-code alignment, symmetry, numeric values, missing values, non-negative weights and expected edge totals before writing browser-ready files to `public/data/`.

See [CODEBOOK.md](CODEBOOK.md) for the data fields, counting approach, display cutoffs and layer definitions.

## Shareable links

The page state is stored in query parameters:

- `view`: `network` or `map`
- `scope`: `commonwealth` or `global`
- `layer`: `publications`, `trials`, `inventions`, `patents` or `grants`
- `detail`: `core`, `balanced` or `full`
- `country`: optional two-letter country code

Example:

<https://adamdu001.github.io/commonwealth-cancer-network/?view=map&scope=commonwealth&layer=grants&detail=full&country=GB>

Legacy `focused` and `detailed` detail values are accepted and mapped to `core` and `full`.

## Integration

The simplest integration with the Health System Visualiser is a link or button that opens the visualiser in a new tab. An iframe should be tested separately against the parent site's content-security and responsive-layout settings.

## Status, attribution and reuse

This is an independent research visualisation. It does not use an official Commonwealth logo and does not imply official endorsement by the Commonwealth Secretariat or its member governments.

No licence has been granted for this repository. The source code and data are public for review, but reuse, redistribution or adaptation requires permission from the repository owner and the relevant data rights holders.
