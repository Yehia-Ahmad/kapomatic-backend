# Warehouse Backend (Node.js)

Backend API for a warehouse system with:
- `categories`
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
- `sellingDate` (required)
- `quantity` (required, positive integer, can also be sent as `quentity`)
- `price` (required, non-negative number, price per each sold item)
- `totalPrice` (auto = `quantity * price`)

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
- `DELETE /api/customers/:id`

Sample customer payload:
```json
{
  "name": "Ahmed Ali",
  "phone": "+201234567890"
}
```

The customer create/update endpoints also accept `customerName` and `customerPhone` as aliases.

### Sellings
- `GET /api/sellings`
- `GET /api/sellings?categoryId=<category_id>&productId=<product_id>&customerName=<customer_name>&sellingDate=<YYYY-MM-DD>`
- `GET /api/sellings/:id`
- `POST /api/sellings`
- `PUT /api/sellings/:id`
- `DELETE /api/sellings/:id`

All selling filters are optional and can be combined together.

Sample selling payload:
```json
{
  "productId": "66b0b7b5a8c197aa0adf1234",
  "customerName": "Ahmed Ali",
  "sellingDate": "2026-02-28T10:30:00.000Z",
  "quantity": 2,
  "price": 15
}
```

Sample selling history item from `GET /api/sellings`:
```json
{
  "_id": "66c8a7f6688b0a2ac9e31234",
  "productId": "66b0b7b5a8c197aa0adf1234",
  "productName": "Wireless Mouse",
  "categoryName": "Electronics",
  "productQuantity": 2,
  "sellingDate": "2026-02-28T10:30:00.000Z",
  "customerName": "Ahmed Ali",
  "productPricePerEach": 15,
  "totalPrice": 30
}
```
