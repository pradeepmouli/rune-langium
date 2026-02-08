---
name: speckit.bugfix
description: Create Bugfix Specification. Handles bugfix workflow operations from spec-kit.
allowed-tools: [read, glob, grep, bash, write]
---

# Create Bugfix Specification

This skill handles the **bugfix** workflow step in spec-kit projects.

## Purpose

The user wants to incorporate the document at: {document_path}

Based on analysis above, create a new bugfix workflow using this document as the primary source.
Extract bug description, reproduction steps, expected vs actual behavior, and root cause if available. Please save this as research in the appropriate workflow directory.


## Usage

This skill is invoked as part of workflow orchestration. When called:

1. Verify spec-kit's `/speckit.bugfix` command exists
2. Execute the command with appropriate context
3. Return results to the calling workflow

## Context

This skill was created by spec-kit-extensions to enable workflow delegation
in Codex, similar to how handoffs work in GitHub Copilot.
