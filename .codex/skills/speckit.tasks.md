---
name: speckit.tasks
description: Break Down Into Tasks. Handles tasks workflow operations from spec-kit.
allowed-tools: [read, glob, grep, bash, write]
---

# Break Down Into Tasks

This skill handles the **tasks** workflow step in spec-kit projects.

## Purpose

Break the bugfix plan into tasks

## Usage

This skill is invoked as part of workflow orchestration. When called:

1. Verify spec-kit's `/speckit.tasks` command exists
2. Execute the command with appropriate context
3. Return results to the calling workflow

## Context

This skill was created by spec-kit-extensions to enable workflow delegation
in Codex, similar to how handoffs work in GitHub Copilot.
