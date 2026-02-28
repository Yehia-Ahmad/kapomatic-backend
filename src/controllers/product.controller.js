const Category = require("../models/category.model");
const Product = require("../models/product.model");
const asyncHandler = require("../utils/asyncHandler");

const getProducts = asyncHandler(async (req, res) => {
  const { categoryId } = req.query;

  if (!categoryId) {
    res.status(400);
    throw new Error("categoryId query parameter is required");
  }

  const category = await Category.findById(categoryId);
  if (!category) {
    res.status(404);
    throw new Error("Category not found for the provided category ID");
  }

  const products = await Product.find({ category: categoryId })
    .populate("category", "name image")
    .sort({ createdAt: -1 });

  res.json(products);
});

const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).populate("category", "name image");

  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }

  res.json(product);
});

const createProduct = asyncHandler(async (req, res) => {
  const {
    name,
    inventoryCount,
    image,
    imageBase64,
    categoryId,
    wholesalePrice,
    retailPrice,
    soldItemCount,
  } = req.body;

  const category = await Category.findById(categoryId);
  if (!category) {
    res.status(404);
    throw new Error("Category not found for the provided category ID");
  }

  if (Number(retailPrice) < Number(wholesalePrice)) {
    res.status(400);
    throw new Error("Retail price must be greater than or equal to wholesale price");
  }

  const payload = {
    name,
    inventoryCount,
    image: imageBase64 !== undefined ? imageBase64 : image,
    category: categoryId,
    wholesalePrice,
    retailPrice,
  };

  if (soldItemCount !== undefined) {
    payload.soldItemCount = soldItemCount;
  }

  const product = await Product.create(payload);
  await product.populate("category", "name image");

  res.status(201).json(product);
});

const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }

  if (req.body.categoryId !== undefined) {
    const category = await Category.findById(req.body.categoryId);
    if (!category) {
      res.status(404);
      throw new Error("Category not found for the provided category ID");
    }
    product.category = req.body.categoryId;
  }

  const nextWholesale =
    req.body.wholesalePrice !== undefined ? req.body.wholesalePrice : product.wholesalePrice;
  const nextRetail = req.body.retailPrice !== undefined ? req.body.retailPrice : product.retailPrice;

  if (Number(nextRetail) < Number(nextWholesale)) {
    res.status(400);
    throw new Error("Retail price must be greater than or equal to wholesale price");
  }

  if (req.body.name !== undefined) product.name = req.body.name;
  if (req.body.inventoryCount !== undefined) product.inventoryCount = req.body.inventoryCount;
  if (req.body.imageBase64 !== undefined) {
    product.image = req.body.imageBase64;
  } else if (req.body.image !== undefined) {
    product.image = req.body.image;
  }
  if (req.body.wholesalePrice !== undefined) product.wholesalePrice = req.body.wholesalePrice;
  if (req.body.retailPrice !== undefined) product.retailPrice = req.body.retailPrice;
  if (req.body.soldItemCount !== undefined) product.soldItemCount = req.body.soldItemCount;

  const updatedProduct = await product.save();
  await updatedProduct.populate("category", "name image");

  res.json(updatedProduct);
});

const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }

  await product.deleteOne();
  res.json({ message: "Product deleted successfully" });
});

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
