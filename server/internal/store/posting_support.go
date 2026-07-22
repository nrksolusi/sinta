package store

import (
	"strings"

	"github.com/shopspring/decimal"
)

// avgCostScale is the decimal scale the average cost is rounded to when written
// to stock_levels. It mirrors the costing engine's internal precision so the
// cached average matches the fold's average.
const avgCostScale = 10

var decimalZero = decimal.Zero

// docTypeCode maps a document type to the token used in the rendered document
// number. M1 uses the default template {TYPE}-{YYYY}-{NNNNN} (ADR-0010); the
// token is the document type upper-cased with separators stripped. Known types
// get a short stable code; unknown types fall back to the upper-cased name so a
// new document type still renders a sensible number.
func docTypeCode(docType string) string {
	switch docType {
	case "goods_receipt":
		return "GR"
	case "delivery":
		return "DEL"
	case "stock_transfer":
		return "TRF"
	case "stock_adjustment":
		return "ADJ"
	case "stock_opname":
		return "OPN"
	case "purchase_order":
		return "PO"
	case "sales_order":
		return "SO"
	default:
		return strings.ToUpper(strings.ReplaceAll(docType, "_", ""))
	}
}
