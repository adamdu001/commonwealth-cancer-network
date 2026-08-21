# Data codebook

## Coverage

The visualiser covers aggregated country-to-country connections observed from 2016–2023. It contains five layers: Publications, Clinical Trials, Inventions, Patents and Grants.

Absence of a link means that no connection was observed in the selected dataset and scope; it does not mean that a country had no cancer research activity.

## Source files

| Layer | Source matrix | Interpretation |
|---|---|---|
| Publications | `paper_mat_16_23.csv` | Cancer publication connections |
| Clinical Trials | `clt_mat_16_23.csv` | Cancer clinical-trial connections |
| Inventions | `patent_mat_16_23_family_inventorship.csv` | Patent-family inventorship by inventor country |
| Patents | `patent_mat_16_23_family_ownership.csv` | Patent-family ownership by owner country |
| Grants | `grant_mat_16_23.csv` | Cancer research-grant connections |

`codes_mapping.csv` supplies country names and `country_cw.csv` supplies the current 56-country Commonwealth membership list used by the visualiser. Annual matrices and `paper_fl` are excluded.

## Counting and weights

Matrix values are undirected country-pair weights. Diagonal entries and zero-weight edges are removed. Fractional counting is adopted when attributing records to affiliated country pairs; each pair receives an equal fraction of a record.

The complete scoped network is used for each country's partner count, strength and strongest-partner ranking. Core and Balanced modes affect presentation only and do not recalculate country profiles.

## Scopes and detail modes

- **Intra-Commonwealth** retains links where both countries occur in `country_cw.csv`.
- **Global** retains all observed country-to-country links.
- **Core**, **Balanced** and **Full** display progressively more links. Cutoffs use edge-count percentile ranks within the selected layer and scope, and ties at the cutoff are retained.
- Countries without a retained link are hidden from the visualisation but remain searchable.

| Layer | Core | Balanced | Full |
|---|---:|---:|---:|
| Publications | 2% | 5% | 100% |
| Clinical Trials | 10% | 20% | 100% |
| Inventions | 15% | 30% | 100% |
| Patents | 20% | 40% | 100% |
| Grants | 50% | 75% | 100% |

## Generated files

### `public/data/manifest.json`

Records the period, country totals, layer labels, colours, source filenames, edge totals, display cutoffs and public-facing metric wording.

### `public/data/nodes.json`

Each country record contains the two-letter code, country name, Commonwealth status, map coordinates and fixed Global and Commonwealth network-layout coordinates.

### `public/data/edges/{layer}.json`

Each undirected edge contains source and target country codes, the raw fractional collaboration weight, tied Global and Commonwealth edge-count percentile ranks, and a display-normalised weight. The Commonwealth rank is null for non-member pairs.

### `public/data/profiles/{layer}.json`

Contains Global and Intra-Commonwealth profiles by country: complete-scope partner count, summed incident-edge strength and up to five strongest partners.

### `public/data/world-110m.json`

Packaged simplified world geometry for the Equal Earth map. The application does not request live map tiles.

## Expected global edge totals

| Layer | Edges |
|---|---:|
| Publications | 13,301 |
| Clinical Trials | 3,441 |
| Inventions | 1,144 |
| Patents | 472 |
| Grants | 176 |
