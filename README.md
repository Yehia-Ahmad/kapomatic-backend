# Warehouse Backend (Node.js)

Backend API for a warehouse system with:
- `categories`
- `credit-sales` (sale on credit invoices with payment tracking)
- `customers`
- `products` (each product belongs to one category)
- `sellings` (selling history with inventory deduction)
- `cart` (checkout endpoint that creates a selling invoice)
- `shipping settings` (government shipping fees and free-shipping threshold)
- `website image targeting` (category, product, combined, and price-based image placement)

## Data Model

### Category
- `name` (required, unique)
- `image` (required, base64 string in raw or data URI format)
- `description` (required)
- `specifications` (optional, array of objects)

### Product
- `name` (required)
- `code` (required)
- `inventoryCount` (required)
- `image` (required, base64 string in raw or data URI format)
- `categoryId` (required, must exist in categories)
- `wholesalePrice` (required)
- `purchasePrice` (optional, defaults to `wholesalePrice`)
- `retailPrice` (required, must be >= wholesale price)
- `soldItemCount` (optional, defaults to `0`)
- `specifications` (optional, array of objects; defaults to a copied snapshot of the category specifications)

### Customer
- `name` (required)
- `phone` (required, unique)

### Selling
- `productId` (required, must exist in products)
- `customerName` (required)
- `customerPhone` (required)
- `shippingLocation` (optional for selling invoices, required for cart checkout)
- `government` (required for cart checkout and selected from the configured government shipping fees)
- `sellingDate` (required)
- `quantity` (required, positive integer, can also be sent as `quentity`)
- `price` (required, non-negative number, price per each sold item)
- `discountAmount` (optional, non-negative number, defaults to `0`)
- `shippingFees` (optional, non-negative number, defaults to `0`)
- `totalPrice` (auto = subtotal - discount + shipping fees)

### Credit Sale
- `customer` (required relation to `Customer`)
- `customerName` (stored snapshot for invoice history)
- `customerPhone` (stored snapshot for invoice history)
- `sellingDate` (required)
- `dueDate` (optional)
- `items` (required, one or more products)
- `totalQuantity` (auto)
- `discountAmount` (optional, non-negative number, defaults to `0`)
- `shippingFees` (optional, non-negative number, defaults to `0`)
- `totalPrice` (auto = subtotal - discount + shipping fees)
- `paidAmount` (auto from payments)
- `remainingAmount` (auto)
- `returnedPaidAmount` (cash returned to the customer because of refunds)
- `reallocatedPaidAmount` (paid amount moved from this invoice to later open invoices after a refund)
- `status` (`pending`, `partially_paid`, `paid`, `Reactionary`)
- `payments` (array of recorded payments)
- `notes` (optional)

### Shipping Setting
- `governmentFees` (array of `{ government, shippingFees }`)
- `freeShippingMinimumAmount` (non-negative number, defaults to `0`)

### General Setting

- `mainLogo` (base64 image or data URI)
- `mainColor` (six-digit hex color, for example `#1A73E8`)
- `currencyCode` (three-letter ISO 4217 currency code, defaults to `EGP`)
- `freeShippingMinimumAmount` (non-negative number, defaults to `0`)
- `storeLocations` (array of `{ name, detailedLocation, mapLink }`)
- `socialMediaLinks` (array of `{ name, link }`)
- `walletPhone` (optional phone number displayed for wallet transfers)
- `instapayLink` (optional HTTPS link displayed for InstaPay transfers)
- `homePageCategoryIds` (ordered list of categories displayed on the website home page)

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

### Public SEO And Sitemaps

JSON sitemap data remains available for API consumers:
- `GET /api/public/seo/sitemap/pages`
- `GET /api/public/seo/sitemap/categories`
- `GET /api/public/seo/sitemap/products`
- `GET /api/public/seo/sitemap/images`

Production XML sitemap files:
- `GET /api/public/seo/sitemaps/pages-ar.xml`
- `GET /api/public/seo/sitemaps/pages-en.xml`
- `GET /api/public/seo/sitemaps/categories-ar.xml`
- `GET /api/public/seo/sitemaps/categories-en.xml`
- `GET /api/public/seo/sitemaps/products-ar.xml`
- `GET /api/public/seo/sitemaps/products-en.xml`
- `GET /api/public/seo/sitemaps/images.xml`
- `GET /api/public/seo/sitemaps/sitemap-index.xml`

If a category, product, or image sitemap grows beyond 50,000 URLs, the sitemap index points crawlers at chunked files such as:
- `GET /api/public/seo/sitemaps/products-ar-1.xml`
- `GET /api/public/seo/sitemaps/products-ar-2.xml`
- `GET /api/public/seo/sitemaps/images-1.xml`

Required public URL environment variables:
- `WEBSITE_ORIGIN`: canonical website origin, for example `https://kapomatic.com`.
- `PUBLIC_API_ORIGIN`: public API origin used for image sitemap URLs, for example `https://api.kapomatic.com`.

If `WEBSITE_ORIGIN` is missing or points to localhost, sitemap URL generation falls back to `https://kapomatic.com`. If `PUBLIC_API_ORIGIN` is missing or points to localhost, image URLs fall back to the public website origin. Sitemap XML responses use `application/xml; charset=utf-8`, the official sitemap namespace, `xhtml:link` alternates, and the Google image sitemap namespace for `images.xml`.

### Categories
- `GET /api/categories`
- `GET /api/categories/export`
- `GET /api/categories/:id`
- `POST /api/categories`
- `POST /api/categories/import` (multipart form-data with an `.xlsx` file in the `file` field)
- `PUT /api/categories/:id`
- `DELETE /api/categories/:id`

Category exports contain a `Categories` sheet and a `Products` sheet. The
`Products` sheet contains one row per product with its complete inventory,
pricing, image, specifications, timestamps, and category details. Oversized
Base64 values are continued in numbered columns such as `ImageBase64_2`.
Category imports process both worksheets, link products using `CategoryName`,
and return `productImportedCount`, `productSkippedCount`, and `productErrors`
alongside the category import result.

Sample category payload:
```json
{
  "name": "Electronics",
  "imageBase64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA",
  "description": "Electronic devices and accessories",
  "specifications": [
    {
      "name": "Color",
      "value": "Black"
    },
    {
      "name": "Size",
      "value": "Medium"
    }
  ]
}
```

### Products
- `GET /api/products?categoryId=<category_id>`
- `GET /api/products/search?q=<code_or_part_of_name>`
- `GET /api/products/export/excel`
- `GET /api/products/:id`
- `GET /api/products/profit-report?categoryId=<category_id>&productId=<product_id>&dateFrom=<YYYY-MM-DD>&dateTo=<YYYY-MM-DD>`
- `GET /api/products/:id/profit-report?dateFrom=<YYYY-MM-DD>&dateTo=<YYYY-MM-DD>`
- `POST /api/products/:id/sync-purchase-price`
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
  "purchasePrice": 7.25,
  "retailPrice": 15,
  "soldItemCount": 10,
  "specifications": [
    {
      "name": "Color",
      "value": "Black"
    },
    {
      "name": "Size",
      "value": "Medium"
    }
  ]
}
```

Product profit report rows contain:
- `productName`
- `categoryName`
- `totalProfit`
- `profitValue`
- `lastSellingDate`
- `lastSellingPrice`
- `invoices` array with `invoiceId`, `type`, `sellingDate`, `sellingPrice`, `quantity`, `revenue`, `purchasePrice`, and `profit`

Profit is calculated from each product invoice item using the stored `purchasePrice`. If `dateFrom` and `dateTo` are omitted, the report includes all invoices.

`POST /api/products/:id/sync-purchase-price` copies the product's current `purchasePrice` into matching cash and credit invoice items, then recalculates each matched item's stored `profitAmount`. Send optional JSON body:

```json
{
  "dateFrom": "2026-03-01",
  "dateTo": "2026-03-31"
}
```

If `dateFrom` and `dateTo` are omitted, all invoices for that product are updated across the system.

### E-commerce Website Settings

- `GET /api/ecommerce-settings/general`
- `PUT /api/ecommerce-settings/general`
- `GET /api/ecommerce-settings/home-page/categories`
- `PUT /api/ecommerce-settings/home-page/categories`
- `GET /api/ecommerce-settings/currency`
- `PUT /api/ecommerce-settings/currency`
- `GET /api/ecommerce-settings/shipping/governments`
- `PUT /api/ecommerce-settings/shipping/governments`
- `PUT /api/ecommerce-settings/shipping/free-minimum`

Set or update the website currency using its three-letter ISO 4217 code:

```json
{
  "currency": "EGP"
}
```

General settings updates are partial. Omitted fields keep their stored values; submitted arrays replace their stored arrays.

Set the ordered categories displayed on the website home page:

```json
{
  "categoryIds": [
    "66b0b7b5a8c197aa0adf1234",
    "66b0b7b5a8c197aa0adf5678"
  ]
}
```

The response contains both `categoryIds` and populated `categories`. Send an empty array to clear the home page selection.

```json
{
  "mainLogo": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
  "mainColor": "#1A73E8",
  "currencyCode": "EGP",
  "freeShippingMinimumAmount": 1000,
  "walletPhone": "+201234567890",
  "instapayLink": "https://ipn.eg/S/example",
  "storeLocations": [
    {
      "name": "Nasr City Store",
      "detailedLocation": "10 Example Street, Nasr City, Cairo",
      "mapLink": "https://maps.google.com/?q=30.05,31.33"
    }
  ],
  "socialMediaLinks": [
    {
      "name": "Facebook",
      "link": "https://www.facebook.com/example"
    }
  ]
}
```

Sample government shipping fees payload:
```json
{
  "governmentFees": [
    {
      "government": "Cairo",
      "shippingFees": 50
    },
    {
      "government": "Giza",
      "shippingFees": 60
    }
  ]
}
```

Sample free shipping minimum payload:
```json
{
  "freeShippingMinimumAmount": 1000
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

`GET /api/customers` returns each customer with:
- `isIndebted`: `true` when the customer has at least one open credit invoice with a remaining balance

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

### Cart
- `POST /api/cart/checkout`

Creates a pending website order from the storefront checkout form. The selected government must exist in the configured government shipping fees. The backend calculates `shippingFees` from that setting and applies free shipping when the cart subtotal reaches a configured non-zero `freeShippingMinimumAmount`.

`paymentMethod` is required. Accepted values are `cash`, `wallet`, and `instapay` (`CASH`, `E_WALLET`, and `INSTAPAY` are also accepted). Wallet and InstaPay orders require `transferPhone` and `transferImage`. `transferImage` must be a base64 image string or data URI. Cash orders ignore transfer phone/image fields.

Sample checkout payload:
```json
{
  "customerName": "Ahmed Ali",
  "customerPhone": "+201234567890",
  "government": "Cairo",
  "shippingLocation": "Cairo, Nasr City",
  "paymentMethod": "wallet",
  "transferPhone": "+201234567890",
  "transferImage": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB...",
  "products": [
    {
      "productId": "66b0b7b5a8c197aa0adf1234",
      "price": 15,
      "quantity": 2
    },
    {
      "productId": "66b0b7b5a8c197aa0adf5678",
      "price": 30
    }
  ]
}
```

`quantity` is optional for cart products and defaults to `1`.

### Website Image Targeting

- `POST /api/website-images`
- `GET /api/website-images`
- `GET /api/website-images/active`
- `GET /api/website-images/active-with-products`
- `GET /api/website-images/:id`
- `GET /api/website-images/:id/image`
- `PUT /api/website-images/:id`
- `DELETE /api/website-images/:id`
- `GET /api/website-images/:id/products`

Example price-targeted image:

```json
{
  "title": "Summer offer",
  "imageBase64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
  "targetType": "price",
  "categoryIds": ["66b0b7b5a8c197aa0adf1234"],
  "maxPrice": 500,
  "isActive": true
}
```

Example view-only image:

```json
{
  "imageBase64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
  "viewOnly": true
}
```

Targeting rules:

- `viewOnly: true` creates a display-only website image. It only requires `imageBase64`/`image` and does not require `targetType`, categories, products, price, or specifications.
- `category` requires at least one `categoryIds` entry and resolves no products.
- `product` requires at least one `productIds` entry.
- `both` requires at least one category and one product.
- `price` requires `maxPrice` and resolves products using `retailPrice`. Optional `categoryIds` restrict the price query to those categories.
- Duplicate IDs are removed, and every referenced category and product must exist.
- `active-with-products` returns `imageUrl` instead of repeating the large `imageBase64` value. Use that URL directly as the image source.

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
  "discountAmount": 10,
  "shippingFees": 25,
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
  "discountAmount": 10,
  "shippingFees": 25,
  "totalPrice": 615,
  "paidAmount": 100,
  "remainingAmount": 515,
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
  "discountAmount": 10,
  "shippingFees": 25,
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
  "discountAmount": 10,
  "shippingFees": 25,
  "totalPrice": 615,
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
  "discountAmount": 10,
  "shippingFees": 25,
  "totalPrice": 615,
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
