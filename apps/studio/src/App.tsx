/**
 * App — Root component for Rune DSL Studio (T089).
 *
 * Orchestrates file loading, parsing, and the editor page.
 */

import { useCallback, useState } from 'react';
import '@xyflow/react/dist/style.css';
import '@rune-langium/visual-editor/styles.css';
import { FileLoader } from './components/FileLoader.js';
import { EditorPage } from './pages/EditorPage.js';
import type { WorkspaceFile } from './services/workspace.js';
import { parseWorkspaceFiles } from './services/workspace.js';

export function App() {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [models, setModels] = useState<unknown[]>([]);
  const [errors, setErrors] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(false);

  const handleFilesLoaded = useCallback(async (loadedFiles: WorkspaceFile[]) => {
    setLoading(true);
    setFiles(loadedFiles);

    const result = await parseWorkspaceFiles(loadedFiles);
    setModels(result.models);
    setErrors(result.errors);
    setLoading(false);
  }, []);

  const handleReset = useCallback(() => {
    setFiles([]);
    setModels([]);
    setErrors(new Map());
  }, []);

  const hasErrors = errors.size > 0;

  return (
    <div className="studio-app">
      <header className="studio-header">
        <h1 className="studio-header__title">Rune DSL Studio</h1>
        {files.length > 0 && (
          <div className="studio-header__actions">
            <span className="studio-header__info">
              {files.length} file(s)
              {hasErrors && (
                <span className="studio-header__errors" title="Parse errors detected">
                  {' '}
                  · {errors.size} with errors
                </span>
              )}
            </span>
            <button className="studio-header__button" onClick={handleReset} title="Close all files">
              Close
            </button>
          </div>
        )}
      </header>

      <main className="studio-main">
        {loading && (
          <div className="studio-loading">
            <p>Parsing files…</p>
          </div>
        )}

        {!loading && files.length === 0 && <FileLoader onFilesLoaded={handleFilesLoaded} />}

        {!loading && files.length > 0 && (
          <EditorPage
            models={models as import('@rune-langium/core').RosettaModel[]}
            files={files}
            onFilesChange={setFiles}
          />
        )}
      </main>
    </div>
  );
}
