// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { handleCodegenDownload, type CodegenDownloadEnv } from '../../src/services/codegen-download-handler.js';

export const onRequestPost: PagesFunction<CodegenDownloadEnv> = handleCodegenDownload;
export {
  __resetDocumentCacheForTests,
  __documentCacheKeysForTests,
  __documentCacheIsBusyForTests
} from '../../src/services/codegen-download-handler.js';
