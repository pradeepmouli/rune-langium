# CDM expression editor fixture

These Apache-2.0 slices retain the upstream declarations reached by core's linked
references from `ConvertToAdjustableOrRelativeDate`: 27 declarations in eight
files. `sources.json` records CDM 7.0.0-dev.83 and Rune DSL 9.76.2, original-file
SHA-256 hashes and slice hashes. Apart from the license header, namespace header
and separation between declarations, source text is unchanged.

The browser journey loads this cohort separately from the codegen execution
fixtures, whose upstream versions differ. The integration test reparses and links
the slices with the authoritative core services; no `.resources` download is
needed in CI.

The cohort is a third-party test input, separate from authored Studio source.
Both browser and scope tests load it through `expressionReferenceFiles`, which
reuses the shared `referenceFiles` integrity checks.

Pinned upstream license and notice files are retained without modification:

- CDM 7.0.0-dev.83: [license](LICENSE-CDM.md), [notice](NOTICE-CDM.md),
  [upstream license](https://github.com/finos/common-domain-model/blob/7.0.0-dev.83/LICENSE.md)
  and [upstream notice](https://github.com/finos/common-domain-model/blob/7.0.0-dev.83/NOTICE.md).
- Rune DSL 9.76.2: [license](LICENSE-Rune.txt), [notice](NOTICE-Rune.txt),
  [upstream license](https://github.com/finos/rune-dsl/blob/9.76.2/LICENSE)
  and [upstream notice](https://github.com/finos/rune-dsl/blob/9.76.2/NOTICE).
