// Package catalog holds pure catalog domain logic: no database or transport
// imports (PLAN.md section 2). The unit-conversion functions here are the one
// piece of catalog logic worth isolating - handlers and document posting rely
// on them to translate between a product's alternative units and its base unit.
package catalog

import (
	"errors"

	"github.com/shopspring/decimal"
)

// ErrNonPositiveFactor is returned when a unit conversion carries a factor that
// is not strictly positive. The schema enforces the same rule
// (product_uoms.factor_to_base CHECK > 0); this guards the pure path so callers
// never divide by zero.
var ErrNonPositiveFactor = errors.New("catalog: factor_to_base must be positive")

// ToBase converts a quantity expressed in an alternative unit into base units,
// given that unit's factor to the base (carton = 24 pcs -> factor 24). The
// result is exact: no rounding, since quantities are numeric, never float.
func ToBase(qty, factorToBase decimal.Decimal) (decimal.Decimal, error) {
	if factorToBase.Sign() <= 0 {
		return decimal.Zero, ErrNonPositiveFactor
	}
	return qty.Mul(factorToBase), nil
}

// FromBase converts a base-unit quantity into an alternative unit given that
// unit's factor to the base. It is the inverse of ToBase; a quantity that does
// not divide evenly keeps its exact fractional value.
func FromBase(baseQty, factorToBase decimal.Decimal) (decimal.Decimal, error) {
	if factorToBase.Sign() <= 0 {
		return decimal.Zero, ErrNonPositiveFactor
	}
	return baseQty.Div(factorToBase), nil
}
