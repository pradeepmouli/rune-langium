// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type React from 'react';
import { FontScaleButton } from '../../../components/FontScaleButton.js';
import { Button } from '@rune-langium/design-system/ui/button';
import { useGithub } from '../../providers/github-context.js';
import { categoryCopy } from '../../../services/github-error-copy.js';

/**
 * SettingsPerspective — per-machine studio settings scaffold.
 *
 * Sections:
 *  1. Appearance — font scale (FontScaleButton, self-contained). Theme is
 *     currently fixed at dark; no toggle is available.
 *  2. GitHub account — connect / disconnect the global GitHub identity used
 *     for git-backed workspace auth.
 *  3. Project configuration — forward-looking placeholder describing the
 *     .runestudio/config.json feature (git-backed shared project config).
 *     Nothing here is persisted or functional yet.
 */

function GitHubAccountSection(): React.ReactElement {
  const { status, user, deviceFlow, error, errorCategory, connect, disconnect } = useGithub();

  return (
    <section data-testid="settings-github-section" className="space-y-4">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        GitHub account
      </h2>

      {status === 'disconnected' && (
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => void connect()}>
            Connect GitHub
          </Button>
        </div>
      )}

      {status === 'connecting' && !deviceFlow && (
        <p className="text-xs text-muted-foreground">Connecting…</p>
      )}

      {status === 'connecting' && deviceFlow && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Open{' '}
            <a
              href={deviceFlow.verificationUri}
              target="_blank"
              rel="noreferrer noopener"
              className="underline"
            >
              {deviceFlow.verificationUri}
            </a>{' '}
            and enter code:
          </p>
          <p className="text-sm font-mono font-semibold">{deviceFlow.userCode}</p>
        </div>
      )}

      {status === 'connected' && (
        <div className="flex items-center gap-3">
          {user?.avatarUrl && (
            <img
              src={user.avatarUrl}
              alt=""
              className="size-6 rounded-full"
            />
          )}
          {user && (
            <span className="text-sm">@{user.login}</span>
          )}
          <Button variant="ghost" size="sm" onClick={() => void disconnect()}>
            Disconnect
          </Button>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-2">
          <p className="text-xs text-destructive">{categoryCopy(errorCategory, error ?? '')}</p>
          <Button size="sm" onClick={() => void connect()}>
            Connect GitHub
          </Button>
        </div>
      )}
    </section>
  );
}

export function SettingsPerspective(): React.ReactElement {
  return (
    <section
      data-testid="settings-perspective"
      className="h-full overflow-auto p-6 space-y-8"
    >
      <h1 className="text-lg font-semibold">Settings</h1>

      {/* ── Appearance ──────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Appearance
        </h2>

        <div className="flex items-center gap-3">
          <span className="text-sm">Pane font size</span>
          <FontScaleButton />
        </div>

        <p className="text-xs text-muted-foreground">
          Theme is currently fixed (dark). A theme toggle will be added in a
          future release.
        </p>
      </section>

      {/* ── GitHub account ──────────────────────────────────────────────── */}
      <GitHubAccountSection />

      {/* ── Project configuration ────────────────────────────────────────── */}
      <section data-testid="settings-project-section" className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Project configuration
        </h2>

        <p className="text-xs text-muted-foreground">
          The following settings will be configurable per-project via{' '}
          <code className="font-mono">.runestudio/config.json</code> once
          git-backed shared project config ships. They are{' '}
          <strong>not editable yet</strong>.
        </p>

        <ul className="space-y-1 text-xs text-muted-foreground opacity-50 list-disc list-inside">
          <li>
            <span className="font-medium">Project</span> — name, description
          </li>
          <li>
            <span className="font-medium">Curated models</span> — model ID +
            version list
          </li>
          <li>
            <span className="font-medium">Sync</span> — auto-sync enabled,
            debounce interval (ms), branch
          </li>
          <li>
            <span className="font-medium">Codegen</span> — target, layout,
            namespaces, options
          </li>
        </ul>
      </section>
    </section>
  );
}
