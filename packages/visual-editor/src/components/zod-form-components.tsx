import * as React from 'react';
import { Input as DesignInput } from '@rune-langium/design-system/ui/input';
import { Textarea as DesignTextarea } from '@rune-langium/design-system/ui/textarea';
export * from '@rune-langium/design-system/ui/components';

import { z } from 'zod';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle
} from '@rune-langium/design-system/ui/field';
export { TypeSelector } from './editors/TypeSelector.js';
import { CardinalityPicker } from './editors/CardinalityPicker.js';
import { type FormMeta } from '@zod-to-form/core';
import {
  DataSchema,
  RosettaEnumerationSchema,
  RosettaEnumSynonymSchema
} from '../generated/zod-schemas.js';

export const Input = DesignInput;
export const Textarea = DesignTextarea;

export const CardinalitySelector = CardinalityPicker;
