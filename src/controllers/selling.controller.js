const mongoose = require("mongoose");
const Product = require("../models/product.model");
const Selling = require("../models/selling.model");
const asyncHandler = require("../utils/asyncHandler");

const getRawQuantity = (body) => {
  if (body.quantity !== undefined) return body.quantity;
  if (body.quentity !== undefined) return body.quentity;
  return undefined;
};

const parsePositiveInteger = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseNonNegativeNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
};

const toSellingHistoryItem = (selling) => ({
  _id: selling._id,
  productId: selling.product,
  productName: selling.productName,
  categoryName: selling.categoryName,
  productQuantity: selling.quantity,
  productQuentity: selling.quantity,
  sellingDate: selling.sellingDate,
  customerName: selling.customerName,
  productPricePerEach: selling.unitPrice,
  totalPrice: selling.totalPrice,
});

const createSelling = asyncHandler(async (req, res) => {
  const { productId, customerName, sellingDate, price } = req.body;
  const rawQuantity = getRawQuantity(req.body);

  if (!productId) {
    res.status(400);
    throw new Error("Product ID is required");
  }

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    res.status(400);
    throw new Error("Invalid product ID format");
  }

  if (rawQuantity === undefined) {
    res.status(400);
    throw new Error("Product quantity is required");
  }

  if (price === undefined) {
    res.status(400);
    throw new Error("Price is required");
  }

  const quantity = parsePositiveInteger(rawQuantity);
  if (quantity === null) {
    res.status(400);
    throw new Error("Product quantity must be a positive integer");
  }

  const unitPrice = parseNonNegativeNumber(price);
  if (unitPrice === null) {
    res.status(400);
    throw new Error("Price must be a non-negative number");
  }

  const product = await Product.findById(productId).populate("category", "name");
  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }

  if (product.inventoryCount < quantity) {
    res.status(400);
    throw new Error("Insufficient inventory for the requested quantity");
  }

  product.inventoryCount -= quantity;
  product.soldItemCount = Number(product.soldItemCount || 0) + quantity;
  await product.save();

  const sellingPayload = {
    product: product._id,
    productName: product.name,
    categoryName: product.category ? product.category.name : "Uncategorized",
    customerName,
    sellingDate,
    quantity,
    unitPrice,
    totalPrice: unitPrice * quantity,
  };

  let selling;
  try {
    selling = await Selling.create(sellingPayload);
  } catch (error) {
    product.inventoryCount += quantity;
    product.soldItemCount = Math.max(0, Number(product.soldItemCount || 0) - quantity);
    await product.save();
    throw error;
  }

  res.status(201).json(toSellingHistoryItem(selling));
});

const getSellings = asyncHandler(async (req, res) => {
  const sellings = await Selling.find().sort({ sellingDate: -1, createdAt: -1 });
  res.json(sellings.map(toSellingHistoryItem));
});

const getSellingById = asyncHandler(async (req, res) => {
  const selling = await Selling.findById(req.params.id);

  if (!selling) {
    res.status(404);
    throw new Error("Selling record not found");
  }

  res.json(toSellingHistoryItem(selling));
});

const updateSelling = asyncHandler(async (req, res) => {
  const selling = await Selling.findById(req.params.id);

  if (!selling) {
    res.status(404);
    throw new Error("Selling record not found");
  }

  const rawQuantity = getRawQuantity(req.body);
  const quantityProvided = rawQuantity !== undefined;
  const nextQuantity = quantityProvided ? parsePositiveInteger(rawQuantity) : selling.quantity;

  if (quantityProvided && nextQuantity === null) {
    res.status(400);
    throw new Error("Product quantity must be a positive integer");
  }

  if (req.body.productId !== undefined && !mongoose.Types.ObjectId.isValid(req.body.productId)) {
    res.status(400);
    throw new Error("Invalid product ID format");
  }

  const nextProductId = req.body.productId !== undefined ? req.body.productId : selling.product.toString();
  const isProductChanged = nextProductId.toString() !== selling.product.toString();
  const isQuantityChanged = Number(nextQuantity) !== Number(selling.quantity);

  if (isProductChanged) {
    const currentProduct = await Product.findById(selling.product);
    if (!currentProduct) {
      res.status(404);
      throw new Error("Current product linked to this selling record was not found");
    }

    currentProduct.inventoryCount += selling.quantity;
    currentProduct.soldItemCount = Math.max(
      0,
      Number(currentProduct.soldItemCount || 0) - Number(selling.quantity)
    );
    await currentProduct.save();

    const nextProduct = await Product.findById(nextProductId).populate("category", "name");
    if (!nextProduct) {
      currentProduct.inventoryCount -= selling.quantity;
      currentProduct.soldItemCount = Number(currentProduct.soldItemCount || 0) + Number(selling.quantity);
      await currentProduct.save();

      res.status(404);
      throw new Error("Product not found");
    }

    if (nextProduct.inventoryCount < nextQuantity) {
      currentProduct.inventoryCount -= selling.quantity;
      currentProduct.soldItemCount = Number(currentProduct.soldItemCount || 0) + Number(selling.quantity);
      await currentProduct.save();

      res.status(400);
      throw new Error("Insufficient inventory for the requested quantity");
    }

    nextProduct.inventoryCount -= nextQuantity;
    nextProduct.soldItemCount = Number(nextProduct.soldItemCount || 0) + Number(nextQuantity);
    await nextProduct.save();

    selling.product = nextProduct._id;
    selling.productName = nextProduct.name;
    selling.categoryName = nextProduct.category ? nextProduct.category.name : "Uncategorized";
    selling.unitPrice = nextProduct.retailPrice;
  } else if (isQuantityChanged) {
    const product = await Product.findById(selling.product);
    if (!product) {
      res.status(404);
      throw new Error("Product linked to this selling record was not found");
    }

    const quantityDifference = Number(nextQuantity) - Number(selling.quantity);
    if (quantityDifference > 0) {
      if (product.inventoryCount < quantityDifference) {
        res.status(400);
        throw new Error("Insufficient inventory for the requested quantity");
      }

      product.inventoryCount -= quantityDifference;
      product.soldItemCount = Number(product.soldItemCount || 0) + quantityDifference;
    } else {
      const restoredQuantity = Math.abs(quantityDifference);
      product.inventoryCount += restoredQuantity;
      product.soldItemCount = Math.max(0, Number(product.soldItemCount || 0) - restoredQuantity);
    }

    await product.save();
  }

  if (req.body.customerName !== undefined) selling.customerName = req.body.customerName;
  if (req.body.sellingDate !== undefined) selling.sellingDate = req.body.sellingDate;
  selling.quantity = Number(nextQuantity);
  selling.totalPrice = Number(selling.unitPrice) * Number(selling.quantity);

  const updatedSelling = await selling.save();
  res.json(toSellingHistoryItem(updatedSelling));
});

const deleteSelling = asyncHandler(async (req, res) => {
  const selling = await Selling.findById(req.params.id);

  if (!selling) {
    res.status(404);
    throw new Error("Selling record not found");
  }

  const product = await Product.findById(selling.product);
  if (product) {
    product.inventoryCount += Number(selling.quantity);
    product.soldItemCount = Math.max(0, Number(product.soldItemCount || 0) - Number(selling.quantity));
    await product.save();
  }

  await selling.deleteOne();
  res.json({ message: "Selling record deleted successfully" });
});

module.exports = {
  createSelling,
  getSellings,
  getSellingById,
  updateSelling,
  deleteSelling,
};
