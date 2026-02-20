/**
 * Built-in Rune DSL base type definitions.
 *
 * These files are always loaded as read-only system files so that
 * types like `number`, `string`, `date`, and annotations like
 * `metadata`, `rootType`, etc. are available for cross-reference resolution.
 *
 * Content sourced from rune-runtime model resources.
 */

export const BASICTYPES_ROSETTA = `namespace com.rosetta.model
version "\${project.version}"

basicType boolean <"A boolean can either be True or False.">

basicType number(
    digits int           <"The maximum number of digits that the number may have. If absent, this number may have an arbitrary number of digits.">
  , fractionalDigits int <"The maximum number of digits after the decimal point that the number may have. If absent, this number may have any number of its digits after the decimal point.">
  , min number           <"The minimum bound on this number. If absent, this number is unbounded from below.">
  , max number           <"The maximum bound on this number. If absent, this number is unbounded from above.">
) <"A signed decimal number.">

basicType string(
    minLength int  <"The minimum number of characters that the string must have. If absent, defaults to zero.">
  , maxLength int  <"The maximum number of characters that the string may have. If absent, there is no limit.">
  , pattern string <"The regular expression that this string must match. If absent, this string may contain arbitrary characters.">
) <"A string of characters.">

basicType time <"The time of the day - hour-minute-second.">

basicType pattern <"A regular expression.">

typeAlias int(digits int, min int, max int): <"A signed decimal integer.">
\tint: number(digits: digits, fractionalDigits: 0, min: min, max: max)

library function DateRanges() date
library function Min(x number, y number) number
library function Max(x number, y number) number
library function Adjust() date
library function Within() boolean
library function IsLeapYear(year number) boolean

recordType date
{
\tday   int
\tmonth int
\tyear  int
}

recordType dateTime
{
\tdate date
\ttime time
}

recordType zonedDateTime
{
\tdate date
\ttime time
\ttimezone string
}

typeAlias productType:
\tstring

typeAlias eventType:
\tstring

typeAlias calculation:
\tstring
`;

export const ANNOTATIONS_ROSETTA = `namespace com.rosetta.model
version "\${project.version}"

annotation metadata: <"Defines metadata that can be specified on types, attributes and enums.">
\tid string (0..1) <"Specifies that an attribute has a key so it can be referenced elsewhere in the model.">
\tkey string (0..1) <"Specifies that a type has a key so it can be referenced elsewhere in the model.">
\treference string (0..1) <"Specifies that an attribute can be specified with a reference that corresponds to a value with a key elsewhere in the model.">
\tscheme string (0..1) <"Specifies that an attribute can have a scheme assoicated with the value.">
\ttemplate string (0..1) <"Specifies that a type can have a template.">
\tlocation string (0..1) <"Specifies this is the target of an internal reference.">
\taddress string (0..1) <"Specified that this is an internal reference to an object that appears elsewhere.">

annotation calculation: <"Marks a function as fully implemented calculation.">

annotation rootType: <"Mark a type as a root of the rosetta model">

annotation qualification: <"Annotation that describes a func that is used for event and product Qualification.">
\t[prefix Qualify]
\tProduct boolean (0..1)
\tBusinessEvent boolean (0..1)

annotation deprecated: <"Marks a type, function or enum as deprecated and will be removed/replaced.">

annotation ingest: <"Marks a function that performs ingestion operations with the in bound serialisation format">
\tJSON boolean (0..1)
\tRUNE_JSON boolean (0..1)
\tXML boolean (0..1)
\tCSV boolean (0..1)

annotation enrich: <"Marks a function that performs enrichment operations">

annotation projection: <"Marks a function that performs projection operations with the out bound serialisation format">
\tJSON boolean (0..1)
\tRUNE_JSON boolean (0..1)
\tXML boolean (0..1)
\tCSV boolean (0..1)

annotation codeImplementation: <"Marks the function as statically implemented by model internal code, with no body defined in Rune.">

annotation suppressWarnings:
\tcapitalisation boolean (0..1)
`;

/** System file descriptors for base types. */
export const BASE_TYPE_FILES = [
  {
    name: 'basictypes.rosetta',
    path: 'system://com.rosetta.model/basictypes.rosetta',
    content: BASICTYPES_ROSETTA,
    dirty: false,
    readOnly: true
  },
  {
    name: 'annotations.rosetta',
    path: 'system://com.rosetta.model/annotations.rosetta',
    content: ANNOTATIONS_ROSETTA,
    dirty: false,
    readOnly: true
  }
] as const;
