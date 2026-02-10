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

/**
 * Dependency injection module for the Rune DSL language.
 *
 * Override or register custom services here (validators, scoping, etc.).
 */
export const RuneDslModule: Module<LangiumCoreServices, PartialLangiumCoreServices> = {
  // Custom services will be registered here as the implementation progresses.
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

  // Initialize configuration for non-LSP usage
  shared.workspace.ConfigurationProvider.initialized({});

  return { shared, RuneDsl };
}
