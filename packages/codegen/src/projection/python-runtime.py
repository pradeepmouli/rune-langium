# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Pradeep Mouli

from __future__ import annotations

import math
from functools import reduce, cmp_to_key
from datetime import date, time, datetime, timedelta
from typing import Any, Callable, TypedDict, NotRequired


def rune_list(value):
    return [] if value is None else value if isinstance(value, list) else [value]


def rune_single(value):
    values = rune_list(value)
    if len(values) > 1:
        raise ValueError("Expected at most one value")
    return values[0] if values else None


def rune_binary(left, right, operate):
    left = [value for value in rune_list(left) if value is not None]
    right = [value for value in rune_list(right) if value is not None]
    return operate(left[0], right[0]) if len(left) == 1 and len(right) == 1 else None


def rune_compare(left, right, compare, quantifier="all"):
    left = [value for value in rune_list(left) if value is not None]
    right = [value for value in rune_list(right) if value is not None]
    if not left or not right:
        return False
    return (all if quantifier == "all" else any)(compare(a, b) for a in left for b in right)


def rune_value_key(value):
    if value is None:
        return ("null",)
    if isinstance(value, bool):
        return ("boolean", value)
    if isinstance(value, (int, float)):
        return ("number", "NaN" if math.isnan(value) else value)
    if isinstance(value, str):
        return ("string", value)
    if isinstance(value, list):
        return ("array", tuple(rune_value_key(item) for item in value))
    return ("object", tuple((key, rune_value_key(value[key])) for key in sorted(value) if value[key] is not None))


def rune_equals(left, right):
    return rune_value_key(left) == rune_value_key(right)


def rune_divide(left, right):
    if right == 0:
        if left == 0:
            return math.nan
        return math.copysign(math.inf, left * math.copysign(1, right))
    return left / right


def rune_get(value, path, many=False):
    for name in path:
        if many:
            value = [child for item in rune_list(value)
                     for child in rune_list(item.get(name) if isinstance(item, dict) else None)]
        else:
            value = value.get(name) if isinstance(value, dict) else None
    return value


def rune_normalize_metadata(value, input_kind, target_kind):
    if isinstance(value, list):
        return [rune_normalize_metadata(item, input_kind, target_kind) for item in value]
    existing = value if input_kind != "value" and value is not None else None
    raw = existing.get("value") if existing is not None else value
    if target_kind == "reference":
        return dict(existing) if existing is not None else {"value": raw}
    if input_kind == "reference" and raw is None:
        raise ValueError("Cannot convert reference metadata to field metadata without a value")
    return {"value": raw, "meta": existing.get("meta", {}) if existing is not None else {}}


def rune_to_field(value, input_kind="value"):
    return rune_normalize_metadata(value, input_kind, "field")


def rune_to_reference(value, input_kind="value"):
    return rune_normalize_metadata(value, input_kind, "reference")


def rune_as_key(value, input_kind="value"):
    if isinstance(value, list):
        return [rune_as_key(item, input_kind) for item in value]
    candidate = value if isinstance(value, dict) else {}
    nested = candidate.get("value") if input_kind != "value" else None
    meta = nested.get("meta", {}) if isinstance(nested, dict) else candidate.get("meta", {})
    external = next((item for item in (meta.get("externalKey"), meta.get("id"), meta.get("key"), candidate.get("externalReference")) if item is not None), None)
    global_key = meta.get("globalKey", candidate.get("globalReference"))
    return {key: item for key, item in (("externalReference", external), ("globalReference", global_key)) if item is not None}


def rune_cardinality(value, lower, upper, label):
    many = upper is None or upper > 1
    value = rune_list(value) if many else rune_single(value)
    size = len(value) if many else int(value is not None)
    if size < lower:
        raise ValueError(label + (" has too few values" if many else " requires a value"))
    if upper is not None and size > upper:
        raise ValueError(label + " has too many values")
    return value


def rune_set(root, path, value, append, lower, upper, label):
    current = root
    for name in path[:-1]:
        existing = current.get(name)
        if existing is None:
            existing = {}
            current[name] = existing
        current = existing
    key = path[-1]
    combined = rune_list(current.get(key)) + rune_list(value) if append else value
    current[key] = rune_cardinality(combined, lower, upper, label)
    return root
