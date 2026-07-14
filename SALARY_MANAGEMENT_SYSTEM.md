# Salary Management System - Implementation Guide

## Overview
A complete salary payment tracking system for system admins to manage employee salary payments, mark salaries as paid, and integrate salary expenses into financial reports.

## Features Implemented

### 1. Database Schema
**Table: `salary_payments`**
- `id` - Primary key
- `user_id` - Foreign key to employees
- `payment_month` - YYYY-MM format (unique with user_id)
- `salary_amount` - Base salary amount
- `paid_amount` - Actual amount paid (can be partial)
- `is_paid` - Boolean flag (0 = unpaid, 1 = paid)
- `payment_date` - Date when salary was paid
- `payment_mode` - Payment method (cash, upi, card)
- `notes` - Optional payment notes
- `created_by` - Admin user who created record
- `created_at` / `updated_at` - Timestamps

### 2. Backend API Endpoints (`/api/salaries`)

#### GET `/api/salaries`
- **Description**: Get all salary payments with filters
- **Query Parameters**:
  - `userId` - Filter by employee ID
  - `paymentMonth` - Filter by month (YYYY-MM)
  - `isPaid` - Filter by payment status (0 or 1)
- **Response**: Array of salary payment records with employee details

#### GET `/api/salaries/user/:userId`
- **Description**: Get all salary records for a specific employee
- **Response**: Employee details + all monthly salary records

#### POST `/api/salaries`
- **Description**: Create new salary payment record
- **Body**:
  - `userId` - Employee ID (required)
  - `paymentMonth` - Month in YYYY-MM format (required)
  - `salaryAmount` - Salary amount (required)
  - `notes` - Optional notes
- **Validation**: Prevents duplicate records for same month

#### POST `/api/salaries/:id/mark-paid`
- **Description**: Mark salary as paid
- **Body**:
  - `paidAmount` - Amount paid (required, cannot exceed salary)
  - `paymentMode` - Payment method: cash|upi|card (required)
  - `paymentDate` - Date of payment (required)
  - `notes` - Optional payment notes
- **Auto-marks as fully paid when paidAmount >= salaryAmount**

#### PUT `/api/salaries/:id`
- **Description**: Update salary record
- **Body**:
  - `salaryAmount` - New salary amount
  - `notes` - Updated notes
- **Restriction**: Cannot update amount for paid records

#### DELETE `/api/salaries/:id`
- **Description**: Delete unpaid salary record
- **Restriction**: Only unpaid records can be deleted

#### GET `/api/salaries/summary/financial`
- **Description**: Get salary summary for financial reports
- **Query Parameters**:
  - `dateFrom` - Start date
  - `dateTo` - End date
- **Returns**: Total paid, total pending, employee counts

### 3. Admin Panel UI

#### New Menu Item
- **Location**: Sidebar navigation
- **Label**: "Salary Management"
- **Access**: Admin only

#### Salary Management Window

##### Section 1: Add/Update Salary
- **Employee Selection**: Dropdown populated with active employees
- **Payment Month**: Month picker (YYYY-MM)
- **Salary Amount**: Numeric input
- **Notes**: Optional text area
- **Actions**: Create/Update Record, Clear Form

##### Section 2: Mark Salary as Paid
- **Salary Selection**: Dropdown showing unpaid salaries
- **Auto-fill on Selection**: Automatically fills paid amount, date
- **Paid Amount**: Editable numeric field
- **Payment Mode**: Cash, UPI, or Card
- **Payment Date**: Date picker
- **Payment Notes**: Optional notes
- **Action**: Mark as Paid

##### Section 3: Salary Records List
- **Filters**:
  - By Employee
  - By Month
  - By Payment Status
- **Display Features**:
  - Employee name and ID
  - Payment month
  - Salary amount
  - Status badge (PAID / UNPAID)
  - Payment method and date (if paid)
  - Edit/Delete buttons (delete only for unpaid)

##### Section 4: Salary Summary Cards
- **Total Salary Expense**: All records combined
- **Paid Salaries**: Total paid out
- **Pending Payment**: Amount still owed

### 4. Financial Reports Integration

#### Updated `/api/accounts/financial-report` Endpoint
- **Feature**: Salary payments now included as expenses
- **Category**: All salaries grouped under "Salary" category
- **Display**: 
  - Shows in "Expense by Category" breakdown
  - Shows in "Expense by Source" (office)
  - Included in total expenses calculation
  - Affects net revenue calculation

#### Financial Report Display
- Salaries appear as line items in full financial report
- Separate from general expenses for clear visibility
- Payment mode (cash/UPI/card) tracked
- Payment date tracked for accurate period reporting

### 5. Frontend JavaScript Functions (`admin.js`)

#### Initialization
- `initSalaryManagement()` - Main initialization function
- Loads employees, populates dropdowns
- Sets up event listeners
- Loads existing salary records

#### Data Loading
- `loadSalaryPayments()` - Fetch and display salary records with filters
- `populateSalaryEmployeeSelects()` - Fill employee dropdowns
- `populateSalaryPaymentSelect()` - Show unpaid salaries for payment

#### Display Functions
- `renderSalaryList()` - Display salary records with status
- `updateSalarySummary()` - Show summary cards
- Edit/delete inline actions

#### Form Handling
- `handleSalaryFormSubmit()` - Create/update salary records
- `handleSalaryPaymentSubmit()` - Mark salary as paid

#### Event Listening
- Auto-loads when admin navigates to salary management window
- Form auto-submit on button click
- Real-time filter updates

## Usage Workflow

### Creating Salary Records
1. Click "Salary Management" in sidebar
2. Select employee from dropdown
3. Choose payment month
4. Enter salary amount
5. Add optional notes
6. Click "Create/Update Record"
7. Record appears in salary list below

### Marking Salary as Paid
1. Select employee and month from "Mark Salary as Paid" section
2. Verify paid amount (auto-filled)
3. Select payment mode
4. Choose payment date
5. Add optional payment notes
6. Click "Mark as Paid"
7. Record status changes to PAID

### Filtering & Viewing Records
1. Use filters to find specific records:
   - Filter by employee name
   - Filter by month
   - Filter by paid/unpaid status
2. Click "Apply Filters" to view results
3. Summary cards update to show totals

### Viewing in Financial Reports
1. Go to "Full Financial Report"
2. Select date range
3. Click "Generate"
4. Scroll to "Expense by Category"
5. Salary expenses appear as separate line item
6. Total expenses and net revenue include salary costs

## Database Queries

### Common Queries

**Get all unpaid salaries for a specific month:**
```sql
SELECT sp.*, u.full_name
FROM salary_payments sp
LEFT JOIN users u ON sp.user_id = u.id
WHERE sp.payment_month = ? AND sp.is_paid = 0
ORDER BY u.full_name;
```

**Get salary summary for a date range:**
```sql
SELECT 
  COUNT(CASE WHEN is_paid = 1 THEN 1 END) AS employees_paid,
  COUNT(CASE WHEN is_paid = 0 THEN 1 END) AS employees_pending,
  SUM(CASE WHEN is_paid = 1 THEN salary_amount ELSE 0 END) AS total_paid,
  SUM(CASE WHEN is_paid = 0 THEN salary_amount ELSE 0 END) AS total_pending
FROM salary_payments
WHERE DATE(payment_date) BETWEEN ? AND ?;
```

## Security & Permissions

- **Admin Only Access**: All salary endpoints require admin role
- **Role Restriction**: `allowRoles(ROLES.ADMIN)` on all routes
- **User Validation**: Employee IDs validated against users table
- **Data Integrity**: Unique constraint on (user_id, payment_month)
- **Audit Logging**: All salary actions logged to logs table

## Error Handling

- Invalid user IDs rejected (404)
- Duplicate records prevented (409)
- Invalid amounts rejected (400)
- Paid records protected from deletion
- Paid records protected from amount changes

## Validation Rules

- **Salary Amount**: Must be positive number
- **Payment Month**: Must be YYYY-MM format
- **Paid Amount**: Cannot exceed salary amount
- **Payment Mode**: Must be cash, upi, or card
- **Payment Date**: Must be valid date
- **Payment Status**: Auto-calculated based on amount paid

## Integration Points

### With User Management
- Employees listed from active users only
- Employee code, title, joining date displayed
- Employee full name shown throughout

### With Financial Reports
- Salary appears in expense categories
- Included in total expenses calculation
- Reflected in net revenue computation
- CSV download includes salary expenses

### With Audit Logging
- Create operations logged
- Update operations logged
- Delete operations logged
- Payment marking logged
- All logs include user, timestamp, details

## Future Enhancements

- Salary slip generation
- Bulk salary uploads
- Salary review period management
- Salary increment tracking
- Tax calculations
- PF/ESI deductions
- Payroll reports
- SMS/Email payment notifications

## Testing Checklist

- [ ] Create salary record for employee
- [ ] View salary record in list
- [ ] Mark salary as paid with full amount
- [ ] Mark salary as paid with partial amount
- [ ] View updated status in list
- [ ] Delete unpaid salary record
- [ ] Attempt to delete paid salary (should fail)
- [ ] Filter by employee
- [ ] Filter by month
- [ ] Filter by status
- [ ] View in financial report
- [ ] Check summary cards accuracy
- [ ] Download financial report CSV

## Files Modified/Created

### Created
- `/src/routes/salaryRoutes.js` - API endpoints
- `/SALARY_MANAGEMENT_SYSTEM.md` - This documentation

### Modified
- `/src/app.js` - Added salary router
- `/src/db/init.js` - Added salary_payments table
- `/frontend/admin.html` - Added salary management UI
- `/frontend/scripts/admin.js` - Added salary management functions
- `/src/routes/accountRoutes.js` - Updated financial report to include salaries

## API Response Examples

### Create Salary Record
```json
{
  "message": "Salary record created",
  "salaryPayment": {
    "id": 1,
    "userId": 5,
    "fullName": "John Doe",
    "paymentMonth": "2024-05",
    "salaryAmount": 50000,
    "paidAmount": 0,
    "isPaid": false,
    "paymentDate": null,
    "paymentMode": null,
    "notes": "May salary",
    "createdAt": "2024-05-01T10:30:00.000Z"
  }
}
```

### Mark as Paid Response
```json
{
  "message": "Salary marked as paid",
  "salaryPayment": {
    "id": 1,
    "userId": 5,
    "fullName": "John Doe",
    "paymentMonth": "2024-05",
    "salaryAmount": 50000,
    "paidAmount": 50000,
    "isPaid": true,
    "paymentDate": "2024-05-05",
    "paymentMode": "cash",
    "notes": "Paid in cash",
    "updatedAt": "2024-05-05T15:00:00.000Z"
  }
}
```

## Troubleshooting

### Salary not appearing in financial report
- Check if salary is marked as paid (`is_paid = 1`)
- Verify payment date falls within report date range
- Ensure employee account is active

### Cannot mark salary as paid
- Check if record still exists in database
- Verify paid amount doesn't exceed salary amount
- Ensure payment date is valid

### Employees not showing in dropdown
- Verify employee accounts are marked as active
- Check user records in database
- Ensure admin has permission to view users

---

**System Version**: 1.0.0  
**Last Updated**: May 2024  
**Developed For**: We Care Diagnostics Centre Lab Management System
