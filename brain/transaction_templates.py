"""
brain/transaction_templates.py — Known transaction types and field mappings.

Covers both ERP-level (purchase orders, invoices, journal entries) and
individual-user (timesheets, expenses, invoices, calendar events) patterns.

Each template defines:
  fields        — ordered list of expected form field labels
  entity_map    — maps parsed entity keys → field labels
  nav_hints     — where to find this form in common apps
  keywords      — phrases that suggest this transaction type

Used by intent_parser.py to identify intent and by form_filler.py to map
parsed entities directly to fields (map_from_entities).
"""

from dataclasses import dataclass, field


@dataclass
class TransactionTemplate:
    id:          str
    label:       str            # human name e.g. "Purchase Order"
    keywords:    list[str]      # phrases that suggest this type
    fields:      list[str]      # expected field labels in order
    entity_map:  dict           # parsed entity key → field label
    nav_hints:   dict           # app_name → navigation path string
    examples:    list[str]      # example natural language inputs


# ── Template definitions ───────────────────────────────────────────────────────

TEMPLATES: dict[str, TransactionTemplate] = {

    "purchase_order": TransactionTemplate(
        id      = "purchase_order",
        label   = "Purchase Order",
        keywords = ["create po", "purchase order", "po for", "order from",
                    "buy from", "procurement", "raise po"],
        fields  = ["Vendor", "Vendor Code", "Amount", "Currency",
                   "Description", "Cost Centre", "GL Code",
                   "Project Code", "Delivery Date", "Approver"],
        entity_map = {
            "vendor":      "Vendor",
            "amount":      "Amount",
            "currency":    "Currency",
            "description": "Description",
            "cost_centre": "Cost Centre",
            "gl_code":     "GL Code",
            "project":     "Project Code",
            "date":        "Delivery Date",
            "approver":    "Approver",
        },
        nav_hints = {
            "SAP":              "Procurement → Purchase Orders → Create (ME21N)",
            "Oracle":           "Procurement → Purchase Orders → Create Order",
            "Dynamics 365":     "Procurement → Purchase Orders → New",
            "NetSuite":         "Transactions → Purchases → Enter Purchase Orders",
        },
        examples = [
            "Create PO for $5,000 to Acme Corp for IT equipment",
            "Raise purchase order for 50 units, vendor Apex Supplies",
            "New PO: $12,000, vendor code V-0042, cost centre MKT-100",
        ],
    ),

    "vendor_invoice": TransactionTemplate(
        id      = "vendor_invoice",
        label   = "Vendor Invoice",
        keywords = ["vendor invoice", "supplier invoice", "post invoice",
                    "invoice from", "ap invoice", "accounts payable"],
        fields  = ["Vendor", "Invoice Number", "Invoice Date", "Due Date",
                   "Amount", "Currency", "GL Code", "Cost Centre",
                   "PO Reference", "Description"],
        entity_map = {
            "vendor":         "Vendor",
            "invoice_number": "Invoice Number",
            "date":           "Invoice Date",
            "due_date":       "Due Date",
            "amount":         "Amount",
            "gl_code":        "GL Code",
            "po_number":      "PO Reference",
            "description":    "Description",
        },
        nav_hints = {
            "SAP":          "Financial Accounting → Accounts Payable → Enter Invoice (FB60)",
            "QuickBooks":   "Expenses → Vendors → Create Bill",
            "Xero":         "Accounts → Bills to Pay → New Bill",
            "NetSuite":     "Transactions → Payables → Enter Bills",
        },
        examples = [
            "Post invoice from TechSupplies, $3,200, invoice #INV-2024-0042",
            "Enter AP invoice for $8,500, vendor Acme, due in 30 days",
        ],
    ),

    "timesheet": TransactionTemplate(
        id      = "timesheet",
        label   = "Timesheet Entry",
        keywords = ["log time", "timesheet", "time entry", "hours on",
                    "worked on", "book time", "enter hours"],
        fields  = ["Date", "Project", "Task / Activity", "Hours",
                   "Description", "Billable"],
        entity_map = {
            "date":        "Date",
            "project":     "Project",
            "task":        "Task / Activity",
            "hours":       "Hours",
            "description": "Description",
            "billable":    "Billable",
        },
        nav_hints = {
            "SAP":      "HR → Time Management → Time Sheet (CATS)",
            "Workday":  "Time → Enter Time",
            "Harvest":  "Timers → Log Time",
            "Toggl":    "Timer → Manual Entry",
            "Jira":     "Issue → Log Work",
        },
        examples = [
            "Log 6 hours on Project Omega, task: backend API",
            "Book 2 hours admin, 5 hours client work for yesterday",
            "Enter time: 8 hours on OM-042, billable",
        ],
    ),

    "expense_report": TransactionTemplate(
        id      = "expense_report",
        label   = "Expense / Reimbursement",
        keywords = ["expense", "reimbursement", "claim", "out of pocket",
                    "receipt", "paid for", "business expense"],
        fields  = ["Date", "Category", "Amount", "Currency",
                   "Description", "Merchant", "Project / Client",
                   "Receipt Attached", "Billable to Client"],
        entity_map = {
            "date":        "Date",
            "category":    "Category",
            "amount":      "Amount",
            "description": "Description",
            "merchant":    "Merchant",
            "project":     "Project / Client",
        },
        nav_hints = {
            "SAP":        "Financial Accounting → Travel Management",
            "Expensify":  "Expenses → New Expense",
            "Concur":     "Expense → Create New Report",
            "Brex":       "Expenses → Submit",
            "Ramp":       "Expenses → New",
        },
        examples = [
            "Add expense: $47 lunch with client, billable to Project Omega",
            "Claim $120 hotel, business trip, last Tuesday",
            "Record $28.50 Uber, client meeting, category: Travel",
        ],
    ),

    "journal_entry": TransactionTemplate(
        id      = "journal_entry",
        label   = "Journal Entry",
        keywords = ["journal entry", "gl entry", "post to gl",
                    "debit credit", "manual journal", "accounting entry"],
        fields  = ["Date", "Reference", "Description",
                   "Debit Account", "Credit Account", "Amount",
                   "Cost Centre", "Currency"],
        entity_map = {
            "date":           "Date",
            "reference":      "Reference",
            "description":    "Description",
            "debit_account":  "Debit Account",
            "credit_account": "Credit Account",
            "amount":         "Amount",
            "cost_centre":    "Cost Centre",
        },
        nav_hints = {
            "SAP":        "Financial Accounting → General Ledger → Post (FB50)",
            "QuickBooks": "Accounting → Journal Entries → New",
            "Xero":       "Accounting → Manual Journals → New",
            "NetSuite":   "Transactions → Financial → Make Journal Entries",
        },
        examples = [
            "Post journal entry: debit 6200, credit 2100, $5,000, accrual",
            "Manual GL: prepaid expense $1,200, debit 1500 credit 2000",
        ],
    ),

    "customer_invoice": TransactionTemplate(
        id      = "customer_invoice",
        label   = "Customer Invoice",
        keywords = ["send invoice", "invoice to", "bill client",
                    "customer invoice", "create invoice", "raise invoice",
                    "invoice for"],
        fields  = ["Customer", "Invoice Date", "Due Date",
                   "Item / Service", "Quantity", "Rate", "Amount",
                   "Project", "Notes"],
        entity_map = {
            "customer":    "Customer",
            "date":        "Invoice Date",
            "due_date":    "Due Date",
            "description": "Item / Service",
            "amount":      "Amount",
            "project":     "Project",
        },
        nav_hints = {
            "QuickBooks": "Sales → Invoices → Create Invoice",
            "Xero":       "Accounts → Sales → New Invoice",
            "FreshBooks": "Invoices → Create New Invoice",
            "Wave":       "Sales → Invoices → Create",
        },
        examples = [
            "Create invoice for $3,200 net 30 to Acme Corp",
            "Send invoice to Sarah Chen for consulting, $4,500",
        ],
    ),

    "calendar_event": TransactionTemplate(
        id      = "calendar_event",
        label   = "Calendar Event",
        keywords = ["schedule", "book meeting", "set up call",
                    "add to calendar", "meeting with", "reminder",
                    "appointment"],
        fields  = ["Title", "Date", "Start Time", "End Time",
                   "Attendees", "Location / Link", "Notes"],
        entity_map = {
            "title":     "Title",
            "date":      "Date",
            "time":      "Start Time",
            "end_time":  "End Time",
            "attendees": "Attendees",
            "location":  "Location / Link",
            "notes":     "Notes",
        },
        nav_hints = {
            "Outlook":        "Calendar → New Event",
            "Google Calendar":"New Event → More Options",
            "Teams":          "Calendar → New Meeting",
        },
        examples = [
            "Schedule follow-up with Sarah Chen next Tuesday at 10am",
            "Book 30-min call with client, Friday 2pm, Zoom",
        ],
    ),
}


def get_template(transaction_type: str) -> TransactionTemplate | None:
    return TEMPLATES.get(transaction_type)


def all_keywords() -> list[tuple[str, str]]:
    """Return [(keyword, transaction_type)] for all templates."""
    result = []
    for tid, tmpl in TEMPLATES.items():
        for kw in tmpl.keywords:
            result.append((kw.lower(), tid))
    return result
