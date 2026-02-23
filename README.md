# rune-langium

Langium port for Rune DSL tooling

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 10.0.0

### Installation

```bash
git clone https://github.com/pradeepmouli/rune-langium.git
cd rune-langium
pnpm install
```

> **Note on Local Dependencies**: This project currently uses local `link:` overrides for `@lspeasy/*` packages in `pnpm-workspace.yaml` and `package.json`. These require a sibling `../lspy` directory to be present during installation. If you're not working on LSP features:
> 
> 1. Comment out the `overrides:` section in `pnpm-workspace.yaml`
> 2. Remove the `@lspeasy/*` dependencies from root `package.json`
> 3. Run `pnpm install` again
> 
> For contributors working on LSP features, ensure the `lspy` repository is cloned as a sibling directory to this repo.

### Development

```bash
# Start development
pnpm run dev

# Run tests
pnpm run test

# Lint and format
pnpm run lint
pnpm run format
```

### Fixture Snapshots

Integration tests and Studio scenarios rely on vendored `.rosetta` fixtures under `.resources/`.

```bash
# Refresh all vendored fixtures (CDM + Rune DSL + Rune FpML)
bash scripts/update-fixtures.sh

# Override refs when needed
bash scripts/update-fixtures.sh --cdm-tag 7.0.0-dev.83 --rune-tag 9.76.2 --fpml-tag master
```

This populates:

- `.resources/cdm`
- `.resources/rune-dsl`
- `.resources/rune-fpml`

## Project Structure

This project uses pnpm workspaces for managing multiple packages:

```
rune-langium/
├── packages/
│   └── [your packages here]
├── docs/
├── .github/workflows/
├── package.json
└── README.md
```

## Creating Your First Package

See [docs/WORKSPACE.md](docs/WORKSPACE.md) for detailed instructions on adding packages.

## Documentation

- [Workspace Guide](docs/WORKSPACE.md) - Managing packages
- [Development Workflow](docs/DEVELOPMENT.md) - Development process
- [Testing Guide](docs/TESTING.md) - Testing setup
- [Examples](docs/EXAMPLES.md) - Usage examples

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - See [LICENSE](LICENSE) for details

---

**Author**: Pradeep Mouli
**Created**: February 9, 2026
