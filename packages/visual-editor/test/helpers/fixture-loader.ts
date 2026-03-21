// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Deterministic fixture loader for visual-editor tests.
 *
 * Provides pre-built AST models from inline Rune DSL source
 * for testing the adapter, layout, and component layers.
 */

/**
 * Minimal model with two Data types and inheritance.
 */
export const SIMPLE_INHERITANCE_SOURCE = `
namespace test.model
version "1.0.0"

type Event:
  eventDate date (1..1)
  [metadata key "Event"]

type Trade extends Event:
  tradeDate date (1..1)
  product Product (1..1)

type Product:
  productName string (1..1)
`;

/**
 * Model with a Choice type.
 */
export const CHOICE_MODEL_SOURCE = `
namespace test.choices
version "1.0.0"

type CashPayment:
  amount number (1..1)

type PhysicalSettlement:
  deliveryDate date (1..1)

choice PaymentType:
  CashPayment
  PhysicalSettlement
`;

/**
 * Model with an Enumeration type.
 */
export const ENUM_MODEL_SOURCE = `
namespace test.enums
version "1.0.0"

enum CurrencyEnum:
  USD
  EUR
  GBP
`;

/**
 * Combined model with Data + Choice + Enum for integration tests.
 */
export const COMBINED_MODEL_SOURCE = `
namespace test.combined
version "1.0.0"

type Trade:
  tradeDate date (1..1)
  currency CurrencyEnum (1..1)

type Product:
  productName string (1..1)

choice PaymentType:
  Trade
  Product

enum CurrencyEnum:
  USD
  EUR
  GBP
`;

/**
 * Model with multiple inheritance levels.
 */
export const DEEP_INHERITANCE_SOURCE = `
namespace test.deep
version "1.0.0"

type Base:
  id string (1..1)

type Middle extends Base:
  name string (1..1)

type Leaf extends Middle:
  value number (1..1)
`;

/**
 * Model with function types including expressions and conditions.
 */
export const FUNCTION_MODEL_SOURCE = `
namespace test.funcs
version "1.0.0"

type Money:
  amount number (1..1)
  currency string (1..1)

func Add:
  inputs:
    a number (1..1)
    b number (1..1)
  output:
    result number (1..1)
  set result:
    a + b

func FilterPositive:
  inputs:
    values number (0..*)
  output:
    result number (0..*)
  set result:
    values filter [ item > 0 ]

func Conditional:
  inputs:
    flag boolean (1..1)
    x number (1..1)
  output:
    result number (1..1)
  set result:
    if flag then x else 0
`;

/**
 * Empty model (no types).
 */
export const EMPTY_MODEL_SOURCE = `
namespace test.empty
version "1.0.0"
`;
