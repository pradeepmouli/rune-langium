// Core AST types — re-export generated types
export * from './generated/ast.js';

// Parse API
export { parse, parseWorkspace } from './api/parse.js';
export type { ParseResult } from './api/parse.js';

// Services
export { createRuneDslServices, RuneDslModule } from './services/rune-dsl-module.js';
export type { RuneDslServices } from './services/rune-dsl-module.js';
export { RuneDslScopeProvider } from './services/rune-dsl-scope-provider.js';
export { RuneDslValidator } from './services/rune-dsl-validator.js';
export {
  RuneDslParser,
  createRuneDslParser,
  insertImplicitBrackets
} from './services/rune-dsl-parser.js';

// Generated module essentials — needed for LSP server integration
export { RuneDslLanguageMetaData } from './generated/module.js';
export { RuneDslGeneratedModule, RuneDslGeneratedSharedModule } from './generated/module.js';

// Serializer
export {
  serializeModel,
  serializeElement,
  serializeModels
} from './serializer/rosetta-serializer.js';

// Utility functions
export {
  isOptional,
  isSingular,
  isPlural,
  isRequired,
  toConstraintString
} from './utils/cardinality-utils.js';
export { getOptions, getEffectiveConditions } from './utils/choice-utils.js';
export {
  hasGeneratedInput,
  setGeneratedInputIfAbsent,
  getFunctionInputs,
  getFunctionOutput
} from './utils/expression-utils.js';
