# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Pradeep Mouli

import ast
import json
import math
import sys
from types import ModuleType

if sys.version_info < (3, 13):
    raise RuntimeError("Python projection checks require Python >=3.13; set PYTHON_BINARY")

request = json.load(sys.stdin)
ast.parse(request["source"], feature_version=(3, 13))
compiled = compile(request["source"], "<Rune Python projection>", "exec")
if request.get("syntax_only"):
    json.dump([], sys.stdout)
    sys.exit(0)
module = ModuleType("rune_projection")
sys.modules[module.__name__] = module
scope = module.__dict__
exec(compiled, scope)

def normalize(value):
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, list):
        return [normalize(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize(item) for key, item in value.items()}
    return value

results = []
for case in request["cases"]:
    scope["data"] = case.get("data", {})
    try:
        results.append({"value": normalize(eval(case["expression"], scope))})
    except Exception as error:
        results.append({"error": str(error)})
json.dump(results, sys.stdout, allow_nan=False)
