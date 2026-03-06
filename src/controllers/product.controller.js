const Category = require("../models/category.model");
const Product = require("../models/product.model");
const asyncHandler = require("../utils/asyncHandler");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getProducts = asyncHandler(async (req, res) => {
  const { categoryId } = req.query;

  if (!categoryId) {
    res.status(400);
    throw new Error("مطلوب معامل الاستعلام categoryId");
  }

  const category = await Category.findById(categoryId);
  if (!category) {
    res.status(404);
    throw new Error("لم يتم العثور على فئة للمعرّف المقدم");
  }

  const products = await Product.find({ category: categoryId })
    .populate("category", "name image")
    .sort({ createdAt: -1 });

  res.json(products);
});

const searchProducts = asyncHandler(async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  if (!q) {
    res.status(400);
    throw new Error("مطلوب معامل الاستعلام q");
  }

  const searchRegex = new RegExp(escapeRegex(q), "i");

  const products = await Product.find({
    $or: [{ code: searchRegex }, { name: searchRegex }],
  })
    .populate("category", "name image")
    .sort({ createdAt: -1 });

  res.json(products);
});

const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).populate("category", "name image");

  if (!product) {
    res.status(404);
    throw new Error("المنتج غير موجود");
  }

  res.json(product);
});

const createProduct = asyncHandler(async (req, res) => {
  const {
    name,
    code,
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
    throw new Error("لم يتم العثور على فئة للمعرّف المقدم");
  }

  if (Number(retailPrice) < Number(wholesalePrice)) {
    res.status(400);
    throw new Error("يجب أن يكون سعر التجزئة أكبر من أو يساوي سعر الجملة");
  }

  const normalizedImage = imageBase64 !== undefined ? imageBase64 : image;

  let normalizedInventoryCount = inventoryCount;
  let normalizedSoldItemCount = soldItemCount;

  if (soldItemCount !== undefined) {
    normalizedInventoryCount = Number(inventoryCount);
    normalizedSoldItemCount = Number(soldItemCount);

    if (!Number.isFinite(normalizedInventoryCount) || !Number.isFinite(normalizedSoldItemCount)) {
      res.status(400);
      throw new Error("يجب أن تكون قيمتا inventoryCount و soldItemCount أرقامًا صالحة");
    }

    if (normalizedSoldItemCount < 0) {
      res.status(400);
      throw new Error("لا يمكن أن تكون قيمة soldItemCount سالبة");
    }

    if (normalizedSoldItemCount > normalizedInventoryCount) {
      res.status(400);
      throw new Error("لا يمكن أن تكون قيمة soldItemCount أكبر من inventoryCount");
    }

    normalizedInventoryCount -= normalizedSoldItemCount;
  }

  const payload = {
    name,
    code,
    inventoryCount: normalizedInventoryCount,
    category: categoryId,
    wholesalePrice,
    retailPrice,
  };

  if (normalizedImage !== undefined) {
    payload.image = normalizedImage;
  }

  if (soldItemCount !== undefined) {
    payload.soldItemCount = normalizedSoldItemCount;
  }

  const product = await Product.create(payload);
  await product.populate("category", "name image");

  res.status(201).json(product);
});

const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error("المنتج غير موجود");
  }

  if (req.body.categoryId !== undefined) {
    const category = await Category.findById(req.body.categoryId);
    if (!category) {
      res.status(404);
      throw new Error("لم يتم العثور على فئة للمعرّف المقدم");
    }
    product.category = req.body.categoryId;
  }

  const nextWholesale =
    req.body.wholesalePrice !== undefined ? req.body.wholesalePrice : product.wholesalePrice;
  const nextRetail = req.body.retailPrice !== undefined ? req.body.retailPrice : product.retailPrice;

  if (Number(nextRetail) < Number(nextWholesale)) {
    res.status(400);
    throw new Error("يجب أن يكون سعر التجزئة أكبر من أو يساوي سعر الجملة");
  }

  if (req.body.name !== undefined) product.name = req.body.name;
  if (req.body.code !== undefined) product.code = req.body.code;
  const currentInventoryCount = Number(product.inventoryCount || 0);
  const payloadInventoryCount = req.body.inventoryCount;
  const hasPayloadInventoryCount = payloadInventoryCount !== undefined;
  const newInventoryInput =
    req.body.newInventory ?? req.body.new_inventory ?? req.body["new inventory"];

  if (
    newInventoryInput !== undefined &&
    (!hasPayloadInventoryCount || Number(payloadInventoryCount) === currentInventoryCount)
  ) {
    const parsedNewInventory = Number(newInventoryInput);

    if (!Number.isFinite(parsedNewInventory)) {
      res.status(400);
      throw new Error("يجب أن تكون قيمة newInventory رقمًا صالحًا");
    }

    if (parsedNewInventory < 0) {
      res.status(400);
      throw new Error("لا يمكن أن تكون قيمة newInventory سالبة");
    }

    product.inventoryCount = currentInventoryCount + parsedNewInventory;
  } else if (hasPayloadInventoryCount) {
    product.inventoryCount = payloadInventoryCount;
  }
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
    throw new Error("المنتج غير موجود");
  }

  await product.deleteOne();
  res.json({ message: "Product deleted successfully" });
});

module.exports = {
  getProducts,
  searchProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
