---
name: speckit.implement
description: Implement Enhancement. Handles implement workflow operations from spec-kit.
allowed-tools: [read, glob, grep, bash, write]
---

# Implement Enhancement

This skill handles the **implement** workflow step in spec-kit projects.

## Purpose

Implement the enhancement following the tasks in enhancement.md

## Usage

This skill is invoked as part of workflow orchestration. When called:

1. Verify spec-kit's `/speckit.implement` command exists
2. Execute the command with appropriate context
3. Return results to the calling workflow

## Context

This skill was created by spec-kit-extensions to enable workflow delegation
in Codex, similar to how handoffs work in GitHub Copilot.
