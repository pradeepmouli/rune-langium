---
name: speckit.plan
description: Create Implementation Plan. Handles plan workflow operations from spec-kit.
allowed-tools: [read, glob, grep, bash, write]
---

# Create Implementation Plan

This skill handles the **plan** workflow step in spec-kit projects.

## Purpose

Create a plan for the bugfix. I am fixing...

## Usage

This skill is invoked as part of workflow orchestration. When called:

1. Verify spec-kit's `/speckit.plan` command exists
2. Execute the command with appropriate context
3. Return results to the calling workflow

## Context

This skill was created by spec-kit-extensions to enable workflow delegation
in Codex, similar to how handoffs work in GitHub Copilot.
