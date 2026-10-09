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
