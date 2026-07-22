package catalog

import (
	"testing"

	"github.com/shopspring/decimal"
)

func dec(s string) decimal.Decimal {
	d, err := decimal.NewFromString(s)
	if err != nil {
		panic(err)
	}
	return d
}

func TestToBase(t *testing.T) {
	tests := []struct {
		name    string
		qty     string
		factor  string
		want    string
		wantErr bool
	}{
		{name: "carton of 24 pcs", qty: "3", factor: "24", want: "72"},
		{name: "base unit factor one", qty: "5", factor: "1", want: "5"},
		{name: "fractional factor", qty: "2", factor: "0.5", want: "1"},
		{name: "fractional qty", qty: "1.5", factor: "12", want: "18"},
		{name: "zero factor rejected", qty: "1", factor: "0", wantErr: true},
		{name: "negative factor rejected", qty: "1", factor: "-2", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ToBase(dec(tt.qty), dec(tt.factor))
			if tt.wantErr {
				if err == nil {
					t.Fatalf("ToBase(%s, %s) = %s, want error", tt.qty, tt.factor, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("ToBase(%s, %s) unexpected error: %v", tt.qty, tt.factor, err)
			}
			if !got.Equal(dec(tt.want)) {
				t.Errorf("ToBase(%s, %s) = %s, want %s", tt.qty, tt.factor, got, tt.want)
			}
		})
	}
}

func TestFromBase(t *testing.T) {
	tests := []struct {
		name    string
		base    string
		factor  string
		want    string
		wantErr bool
	}{
		{name: "72 pcs to cartons of 24", base: "72", factor: "24", want: "3"},
		{name: "base unit factor one", base: "5", factor: "1", want: "5"},
		{name: "non-integer result kept exact", base: "5", factor: "2", want: "2.5"},
		{name: "zero factor rejected", base: "1", factor: "0", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := FromBase(dec(tt.base), dec(tt.factor))
			if tt.wantErr {
				if err == nil {
					t.Fatalf("FromBase(%s, %s) = %s, want error", tt.base, tt.factor, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("FromBase(%s, %s) unexpected error: %v", tt.base, tt.factor, err)
			}
			if !got.Equal(dec(tt.want)) {
				t.Errorf("FromBase(%s, %s) = %s, want %s", tt.base, tt.factor, got, tt.want)
			}
		})
	}
}

func TestRoundTripToBaseFromBase(t *testing.T) {
	qty := dec("7")
	factor := dec("24")
	base, err := ToBase(qty, factor)
	if err != nil {
		t.Fatalf("ToBase: %v", err)
	}
	back, err := FromBase(base, factor)
	if err != nil {
		t.Fatalf("FromBase: %v", err)
	}
	if !back.Equal(qty) {
		t.Errorf("round trip = %s, want %s", back, qty)
	}
}
