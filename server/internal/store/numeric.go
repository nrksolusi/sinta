package store

import (
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"
)

// Numeric converts a shopspring decimal to a pgtype.Numeric for the store
// boundary. Money and quantity are decimal in the domain and numeric in
// Postgres, never float (CLAUDE.md load-bearing rules). The string round-trip is
// exact for decimals of any scale.
func Numeric(d decimal.Decimal) (pgtype.Numeric, error) {
	var n pgtype.Numeric
	if err := n.Scan(d.String()); err != nil {
		return pgtype.Numeric{}, fmt.Errorf("decimal %s to numeric: %w", d, err)
	}
	return n, nil
}

// Decimal converts a pgtype.Numeric read from Postgres back to a shopspring
// decimal. A NULL or unset numeric decodes to zero.
func Decimal(n pgtype.Numeric) (decimal.Decimal, error) {
	if !n.Valid {
		return decimal.Zero, nil
	}
	v, err := n.Value() // driver.Value: the canonical numeric string
	if err != nil {
		return decimal.Zero, fmt.Errorf("numeric to driver value: %w", err)
	}
	s, ok := v.(string)
	if !ok {
		return decimal.Zero, fmt.Errorf("numeric driver value is %T, want string", v)
	}
	d, err := decimal.NewFromString(s)
	if err != nil {
		return decimal.Zero, fmt.Errorf("numeric string %q to decimal: %w", s, err)
	}
	return d, nil
}
