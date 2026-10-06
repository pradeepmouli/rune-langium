# SPDX-License-Identifier: FSL-1.1-ALv2
# Copyright (c) 2026 Pradeep Mouli

"""Regenerate CDM goldens using the pinned, unmodified Python distribution."""

import datetime
import importlib
import importlib.metadata
import json
from decimal import Decimal
from enum import Enum
from pathlib import Path
from typing import get_type_hints

from pydantic import BaseModel, TypeAdapter
from rune.runtime.cow import rune_unwrap

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "scripts/fixtures/cdm-reference"


def python_input(value):
    if isinstance(value, list):
        return [python_input(item) for item in value]
    if isinstance(value, dict):
        if set(value) == {"value", "meta"}:
            return {"@data": value["value"], **{"@" + k: v for k, v in value["meta"].items()}}
        return {key: python_input(item) for key, item in value.items()}
    return value


def canonical(value):
    value = rune_unwrap(value)
    if isinstance(value, BaseModel):
        return canonical(value.model_dump(mode="python", exclude_none=True))
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, (datetime.date, datetime.time, datetime.datetime)):
        return value.isoformat()
    if isinstance(value, list):
        return [canonical(item) for item in value]
    if isinstance(value, dict):
        if "@data" in value:
            meta = {key[1:]: item for key, item in value.items() if key != "@data"}
            return {"value": canonical(value["@data"]), **({"meta": meta} if meta else {})}
        return {key: canonical(item) for key, item in value.items() if item is not None}
    return value


def main():
    for requirement in (FIXTURES / "requirements.txt").read_text().splitlines():
        name, version = requirement.split("==")
        if importlib.metadata.version(name) != version:
            raise RuntimeError(f"Oracle requires {requirement}")
    cases = json.loads((FIXTURES / "inputs.json").read_text())
    for case in cases:
        namespace, name = case["function"].rsplit(".", 1)
        function = getattr(importlib.import_module(f"finos.{namespace}.functions.{name}"), name)
        annotations = get_type_hints(function)
        inputs = {
            key: TypeAdapter(annotations[key]).validate_python(python_input(value))
            for key, value in case["inputs"].items()
        }
        try:
            result = function(**inputs)
        except Exception as error:
            if not case.get("expectError"):
                raise RuntimeError(f"Oracle failed for {case['id']}") from error
            # Precondition cases must fail their named condition, never a native stub.
            if "PositiveNearest" not in str(error):
                raise RuntimeError(f"Unexpected oracle error for {case['id']}: {error}") from error
            case["expectedError"] = "PositiveNearest"
        else:
            if case.get("expectError"):
                raise RuntimeError(f"Expected oracle rejection for {case['id']}")
            case["expected"] = canonical(result)
    output = ROOT / "packages/codegen/test/fixtures/cdm-reference/cases.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(cases, indent=2, ensure_ascii=False) + "\n")
    print(f"Recorded {len(cases)} reference cases from finos-cdm==7.0.0")


if __name__ == "__main__":
    main()
