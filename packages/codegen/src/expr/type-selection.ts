// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { isData, type RosettaType } from '@rune-langium/core';
import { featureIsRequired, featureName, typeFeatures, typeMatches } from './navigation.js';

/** Declaration identity and required/discriminating fields, independent of target syntax. */
export function dataSelectionFacts(target: RosettaType, input: RosettaType) {
  const features = typeFeatures(target);
  const known = new Set(
    [...typeFeatures(input), ...typeFeatures(isData(target) ? target.superType?.ref : undefined)].map(featureName)
  );
  return {
    required: features.filter(featureIsRequired).map(featureName),
    matches: typeMatches(input, target),
    distinguishing: features.filter((feature) => !known.has(featureName(feature))).map(featureName)
  };
}
