import type {
  Module,
  LangiumCoreServices,
  PartialLangiumCoreServices,
  LangiumSharedCoreServices,
  DefaultSharedCoreModuleContext
} from 'langium';
import {
  inject,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  EmptyFileSystem
} from 'langium';
import { RuneDslGeneratedModule, RuneDslGeneratedSharedModule } from '../generated/module.js';
import { RuneDslScopeProvider } from './rune-dsl-scope-provider.js';
import { RuneDslValidator } from './rune-dsl-validator.js';

/**
 * Union type for all services available in the Rune DSL language.
 */
export type RuneDslServices = LangiumCoreServices;

/**
 * Dependency injection module for the Rune DSL language.
 *
 * Override or register custom services here (validators, scoping, etc.).
 */
export const RuneDslModule: Module<LangiumCoreServices, PartialLangiumCoreServices> = {
  references: {
    ScopeProvider: (services) => new RuneDslScopeProvider(services)
  }
};

/**
 * Create the full set of services required for the Rune DSL language.
 */
export function createRuneDslServices(context: DefaultSharedCoreModuleContext = EmptyFileSystem): {
  shared: LangiumSharedCoreServices;
  RuneDsl: LangiumCoreServices;
} {
  const shared = inject(createDefaultSharedCoreModule(context), RuneDslGeneratedSharedModule);
  const RuneDsl = inject(
    createDefaultCoreModule({ shared }),
    RuneDslGeneratedModule,
    RuneDslModule
  );
  shared.ServiceRegistry.register(RuneDsl);

  // Register validation checks
  const validator = new RuneDslValidator();
  validator.registerChecks(RuneDsl);

  // Initialize configuration for non-LSP usage
  shared.workspace.ConfigurationProvider.initialized({});

  return { shared, RuneDsl };
}
