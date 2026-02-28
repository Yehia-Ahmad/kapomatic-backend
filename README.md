# Warehouse Backend (Node.js)

Backend API for a warehouse system with:
- `categories`
- `products` (each product belongs to one category)

## Data Model

### Category
- `name` (required, unique)
- `image` (required, base64 string in raw or data URI format)
- `description` (required)

### Product
- `name` (required)
- `inventoryCount` (required)
- `image` (required, base64 string in raw or data URI format)
- `categoryId` (required, must exist in categories)
- `wholesalePrice` (required)
- `retailPrice` (required, must be >= wholesale price)
- `soldItemCount` (optional, defaults to `0`)

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
- `GET /api/products/:id`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`

Sample product payload:
```json
{
  "name": "Wireless Mouse",
  "inventoryCount": 100,
  "imageBase64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA",
  "categoryId": "66b0b7b5a8c197aa0adf1234",
  "wholesalePrice": 8.5,
  "retailPrice": 15,
  "soldItemCount": 10
}
```
