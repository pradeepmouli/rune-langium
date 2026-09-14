// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

export const mixedChoiceSource = `namespace test.mixedChoice
type Payload:
 value string (1..1)
 amount int (1..1)
choice Wrapped:
 Payload
  [metadata scheme]
choice Referenced:
 Payload
  [metadata reference]
choice Raw:
 Payload
choice Other:
 string
choice Outer:
 Wrapped
  [metadata reference]
 Referenced
 Raw
 Other
`;

export const mixedChoiceCases = [
  {
    input: { raw: { payload: { value: 'raw payload', amount: 7 } } },
    wrapped: { value: { value: 'raw payload', amount: 7 } }
  },
  {
    input: {
      wrapped: { value: { payload: { value: { value: 'field payload', amount: 8 }, meta: { scheme: 'urn:payload' } } } }
    },
    wrapped: { value: { value: 'field payload', amount: 8 }, meta: { scheme: 'urn:payload' } }
  },
  {
    input: {
      referenced: { payload: { value: { value: 'reference payload', amount: 9 }, externalReference: 'payload-9' } }
    },
    wrapped: { value: { value: 'reference payload', amount: 9 }, externalReference: 'payload-9' }
  },
  {
    input: { referenced: { payload: { externalReference: 'unresolved' } } },
    wrapped: { externalReference: 'unresolved', value: undefined }
  }
];
