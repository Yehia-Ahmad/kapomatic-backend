# Warehouse Backend (Node.js)

Backend API for a warehouse system with:
- `categories`
- `credit-sales` (sale on credit invoices with payment tracking)
- `customers`
- `products` (each product belongs to one category)
- `sellings` (selling history with inventory deduction)

## Data Model

### Category
- `name` (required, unique)
- `image` (required, base64 string in raw or data URI format)
- `description` (required)

### Product
- `name` (required)
- `code` (required)
- `inventoryCount` (required)
- `image` (required, base64 string in raw or data URI format)
- `categoryId` (required, must exist in categories)
- `wholesalePrice` (required)
- `retailPrice` (required, must be >= wholesale price)
- `soldItemCount` (optional, defaults to `0`)

### Customer
- `name` (required)
- `phone` (required, unique)

### Selling
- `productId` (required, must exist in products)
- `customerName` (required)
- `customerPhone` (required)
- `sellingDate` (required)
- `quantity` (required, positive integer, can also be sent as `quentity`)
- `price` (required, non-negative number, price per each sold item)
- `totalPrice` (auto = `quantity * price`)

### Credit Sale
- `customer` (required relation to `Customer`)
- `customerName` (stored snapshot for invoice history)
- `customerPhone` (stored snapshot for invoice history)
- `sellingDate` (required)
- `dueDate` (optional)
- `items` (required, one or more products)
- `totalQuantity` (auto)
- `totalPrice` (auto)
- `paidAmount` (auto from payments)
- `remainingAmount` (auto)
- `returnedPaidAmount` (cash returned to the customer because of refunds)
- `reallocatedPaidAmount` (paid amount moved from this invoice to later open invoices after a refund)
- `status` (`pending`, `partially_paid`, `paid`, `Reactionary`)
- `payments` (array of recorded payments)
- `notes` (optional)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file from `.env.example`:
```bash
cp .env.example .env
```

3. Run in development:
```bash
npm run dev
```

4. Run in production:
```bash
npm start
```

## API Endpoints

### Categories
- `GET /api/categories`
- `GET /api/categories/:id`
- `POST /api/categories`
- `PUT /api/categories/:id`
- `DELETE /api/categories/:id`

Sample category payload:
```json
{
  "name": "Electronics",
  "imageBase64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA",
  "description": "Electronic devices and accessories"
}
```

### Products
- `GET /api/products?categoryId=<category_id>`
- `GET /api/products/search?q=<code_or_part_of_name>`
- `GET /api/products/:id`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`

Sample product payload:
```json
{
  "name": "Wireless Mouse",
  "code": "WM-001",
  "inventoryCount": 100,
  "imageBase64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA",
  "categoryId": "66b0b7b5a8c197aa0adf1234",
  "wholesalePrice": 8.5,
  "retailPrice": 15,
  "soldItemCount": 10
}
```

### Customers
- `GET /api/customers`
- `GET /api/customers?search=<name_or_phone>`
- `GET /api/customers?name=<customer_name>&phone=<customer_phone>`
- `GET /api/customers/:id`
- `POST /api/customers`
- `PUT /api/customers/:id`
- `POST /api/customers/:id/payments`
- `DELETE /api/customers/:id`

Sample customer payload:
```json
{
  "name": "Ahmed Ali",
  "phone": "+201234567890"
}
```

The customer create/update endpoints also accept `customerName` and `customerPhone` as aliases.

`GET /api/customers/:id` now returns the customer document plus:
- `lastCreditSaleDate`
- `lastCashSaleDate`
- `lastCreditSalePaymentDate`
- `creditSummary`
- `creditHistory`

Each entry in `creditHistory` is a normalized credit-sale invoice tied to that customer.

`creditSummary` includes:
- `debtStatusSummary`
- `totalDebtAmount`
- `paidAmount`
- `remainingAmount`
- `totalRefundDueAmount`
- `totalReturnedPaidAmount`
- `totalReallocatedPaidAmount`

If a customer has related credit-sale records, deleting that customer is blocked.

`POST /api/customers/:id/payments` adds a payment to either the customer's first open invoice or last open invoice.
Send exactly one of `firstInvoice` or `lastInvoice` as `true` together with the payment `amount`.
If `firstInvoice` is selected, the entered `amount` cannot be greater than that invoice `remainingAmount`.
If `lastInvoice` is selected and the entered `amount` is greater than the last invoice `remainingAmount`, the backend automatically distributes the extra amount to the customer's other open invoices in newest-to-oldest order.
If the entered `amount` is greater than the total remaining balance across all open invoices, the API returns `400` with `message`, `invoiceId`, `remainingAmount`, and `totalRemainingAmount`.

Sample customer payment payload:
```json
{
  "amount": 150,
  "firstInvoice": false,
  "lastInvoice": true,
  "paymentDate": "2026-03-20",
  "note": "Customer installment"
}
```

### Credit Sales
- `GET /api/credit-sales`
- `GET /api/credit-sales?customerId=<customer_id>&status=<pending|partially_paid|paid|Reactionary>&sellingDate=<YYYY-MM-DD>`
- `GET /api/credit-sales/:id`
- `POST /api/credit-sales`
- `PUT /api/credit-sales/:id`
- `DELETE /api/credit-sales/:id`
- `POST /api/credit-sales/:id/payments`
- `POST /api/credit-sales/:id/refunds`

All credit-sale filters are optional and can be combined together. Supported filters are:
- `customerId`
- `customerName`
- `customerPhone`
- `status`
- `sellingDate`
- `dueDate`

Creating a credit sale accepts either `customerId` for an existing customer, or `customerName` + `customerPhone` to link or create the customer automatically.

Credit-sale refunds support:
- partial returns by sending specific `items`
- full returns by sending `refundAll: true`
- automatic inventory restoration
- recalculating `totalPrice`, `remainingAmount`, and `refundDueAmount`
- when a partial return makes the source invoice overpaid, the excess is applied automatically to the customer's other open credit invoices in ascending order
- any remaining excess after settling other open credit invoices is returned to the customer and stored in `returnedPaidAmount`
- auto-transferred paid amounts are stored in `reallocatedPaidAmount`

Sample credit-sale payload:
```json
{
  "customerId": "67d0b7b5a8c197aa0adf1234",
  "sellingDate": "2026-03-14",
  "dueDate": "2026-04-14",
  "notes": "Monthly installment",
  "initialPaidAmount": 100,
  "items": [
    {
      "productId": "66b0b7b5a8c197aa0adf1234",
      "quantity": 2,
      "price": 150
    },
    {
      "productId": "66b0b7b5a8c197aa0adf5678",
      "quantity": 1,
      "price": 300
    }
  ]
}
```

Sample credit-sale response:
```json
{
  "_id": "67d0b7b5a8c197aa0adf9999",
  "invoiceId": "67d0b7b5a8c197aa0adf9999",
  "customerId": "67d0b7b5a8c197aa0adf1234",
  "customerName": "Ahmed Ali",
  "customerPhone": "+201234567890",
  "sellingDate": "2026-03-14T00:00:00.000Z",
  "dueDate": "2026-04-14T00:00:00.000Z",
  "status": "partially_paid",
  "notes": "Monthly installment",
  "itemCount": 2,
  "refundCount": 0,
  "totalQuantity": 3,
  "totalPrice": 600,
  "paidAmount": 100,
  "remainingAmount": 500,
  "refundDueAmount": 0,
  "refundStatus": "none",
  "refundedQuantity": 0,
  "refundedAmount": 0,
  "returnedPaidAmount": 0,
  "reallocatedPaidAmount": 0,
  "payments": [
    {
      "_id": "67d0b7b5a8c197aa0adf7777",
      "amount": 100,
      "paymentDate": "2026-03-14T00:00:00.000Z",
      "note": null
    }
  ],
  "refunds": [],
  "items": [
    {
      "_id": "67d0b7b5a8c197aa0adf1111",
      "invoiceId": "67d0b7b5a8c197aa0adf9999",
      "productId": "66b0b7b5a8c197aa0adf1234",
      "productName": "Wireless Mouse",
      "categoryName": "Electronics",
      "productQuantity": 2,
      "productQuentity": 2,
      "sellingDate": "2026-03-14T00:00:00.000Z",
      "dueDate": "2026-04-14T00:00:00.000Z",
      "customerId": "67d0b7b5a8c197aa0adf1234",
      "customerName": "Ahmed Ali",
      "customerPhone": "+201234567890",
      "productPricePerEach": 150,
      "totalPrice": 300
    }
  ],
  "createdAt": "2026-03-14T08:00:00.000Z",
  "updatedAt": "2026-03-14T08:00:00.000Z"
}
```

Sample payment payload:
```json
{
  "amount": 150,
  "paymentDate": "2026-03-20",
  "note": "Second installment"
}
```

`POST /api/credit-sales/:id/payments` pays the selected invoice first.
If the entered `amount` is greater than that invoice `remainingAmount`, the backend automatically distributes the extra amount to the customer's other open invoices in newest-to-oldest order.
If the entered `amount` is greater than the total remaining balance across all of the customer's open invoices, the API returns `400` with `message`, `invoiceId`, `remainingAmount`, and `totalRemainingAmount`.

Sample partial refund payload:
```json
{
  "refundDate": "2026-03-21",
  "note": "Customer returned one unit",
  "items": [
    {
      "productId": "66b0b7b5a8c197aa0adf1234",
      "quantity": 1
    }
  ]
}
```

Sample full refund payload:
```json
{
  "refundDate": "2026-03-22",
  "note": "Customer returned the full invoice",
  "refundAll": true
}
```

When the full invoice is returned, the backend also returns the invoice `paidAmount` automatically and stores it in `returnedPaidAmount`, so the invoice net `paidAmount` becomes `0`.
When the full invoice is returned, the invoice `status` becomes `Reactionary`.
When a partial return makes the invoice overpaid, the backend reallocates that overpaid amount to the customer's other open credit invoices before returning any leftover cash.

### Sellings
- `GET /api/sellings`
- `GET /api/sellings?categoryId=<category_id>&productId=<product_id>&customerName=<customer_name>&sellingDate=<YYYY-MM-DD>`
- `GET /api/sellings/:id`
- `POST /api/sellings`
- `PUT /api/sellings/:id`
- `DELETE /api/sellings/:id`

All selling filters are optional and can be combined together.

When creating a selling, the backend checks the customer by `customerName` and `customerPhone`. If no exact match exists, it creates the customer record. If the phone already exists with a different name, the customer name is updated to match the selling payload.

`POST /api/sellings` accepts either the legacy single-item payload or the new invoice-style payload with one or more entries inside `items`. The backend stores the whole request as a single invoice document, and each line item is kept inside `items`.

Sample bulk selling payload:
```json
{
  "customerName": "Ahmed Ali",
  "customerPhone": "+201234567890",
  "sellingDate": "2026-03-12",
  "items": [
    {
      "productId": "66b0b7b5a8c197aa0adf1234",
      "quantity": 2,
      "price": 150
    },
    {
      "productId": "66b0b7b5a8c197aa0adf5678",
      "quantity": 1,
      "price": 300
    }
  ]
}
```

Sample bulk selling response:
```json
{
  "_id": "67d0b7b5a8c197aa0adf9999",
  "invoiceId": "67d0b7b5a8c197aa0adf9999",
  "customerName": "Ahmed Ali",
  "customerPhone": "+201234567890",
  "sellingDate": "2026-03-12T00:00:00.000Z",
  "itemCount": 2,
  "totalQuantity": 3,
  "totalPrice": 600,
  "items": [
    {
      "_id": "67d0b7b5a8c197aa0adf1111",
      "invoiceId": "67d0b7b5a8c197aa0adf9999",
      "productId": "66b0b7b5a8c197aa0adf1234",
      "productName": "Wireless Mouse",
      "categoryName": "Electronics",
      "productQuantity": 2,
      "productQuentity": 2,
      "sellingDate": "2026-03-12T00:00:00.000Z",
      "customerName": "Ahmed Ali",
      "customerPhone": "+201234567890",
      "productPricePerEach": 150,
      "totalPrice": 300
    },
    {
      "_id": "67d0b7b5a8c197aa0adf2222",
      "invoiceId": "67d0b7b5a8c197aa0adf9999",
      "productId": "66b0b7b5a8c197aa0adf5678",
      "productName": "Keyboard",
      "categoryName": "Electronics",
      "productQuantity": 1,
      "productQuentity": 1,
      "sellingDate": "2026-03-12T00:00:00.000Z",
      "customerName": "Ahmed Ali",
      "customerPhone": "+201234567890",
      "productPricePerEach": 300,
      "totalPrice": 300
    }
  ]
}
```

Sample selling invoice from `GET /api/sellings`:
```json
{
  "_id": "67d0b7b5a8c197aa0adf9999",
  "invoiceId": "67d0b7b5a8c197aa0adf9999",
  "customerName": "Ahmed Ali",
  "customerPhone": "+201234567890",
  "sellingDate": "2026-03-12T00:00:00.000Z",
  "itemCount": 2,
  "totalQuantity": 3,
  "totalPrice": 600,
  "items": [
    {
      "_id": "67d0b7b5a8c197aa0adf1111",
      "invoiceId": "67d0b7b5a8c197aa0adf9999",
      "productId": "66b0b7b5a8c197aa0adf1234",
      "productCode": "WM-001",
      "productName": "Wireless Mouse",
      "categoryName": "Electronics",
      "productQuantity": 2,
      "productQuentity": 2,
      "sellingDate": "2026-03-12T00:00:00.000Z",
      "customerName": "Ahmed Ali",
      "customerPhone": "+201234567890",
      "productPricePerEach": 150,
      "totalPrice": 300
    }
  ]
}
```
