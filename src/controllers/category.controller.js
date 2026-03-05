const Category = require("../models/category.model");
const Product = require("../models/product.model");
const asyncHandler = require("../utils/asyncHandler");

const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find().sort({ createdAt: 1 });
  res.json(categories);
});

const getCategoryById = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    res.status(404);
    throw new Error("الفئة غير موجودة");
  }

  res.json(category);
});

const createCategory = asyncHandler(async (req, res) => {
  const { name, image, imageBase64 } = req.body;
  const normalizedImage = imageBase64 !== undefined ? imageBase64 : image;

  const categoryData = {
    name,
  };

  if (normalizedImage !== undefined) {
    categoryData.image = normalizedImage;
  }

  const category = await Category.create(categoryData);

  res.status(201).json(category);
});

const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    res.status(404);
    throw new Error("الفئة غير موجودة");
  }

  if (req.body.name !== undefined) category.name = req.body.name;
  if (req.body.imageBase64 !== undefined) {
    category.image = req.body.imageBase64;
  } else if (req.body.image !== undefined) {
    category.image = req.body.image;
  }

  const updatedCategory = await category.save();
  res.json(updatedCategory);
});

const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    res.status(404);
    throw new Error("الفئة غير موجودة");
  }

  await Product.deleteMany({ category: category._id });

  await category.deleteOne();
  res.json({ message: "Category deleted successfully" });
});

module.exports = {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};
