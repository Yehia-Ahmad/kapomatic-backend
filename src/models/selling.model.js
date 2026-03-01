const mongoose = require("mongoose");

const sellingSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product ID is required"],
    },
    productName: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      maxlength: [200, "Product name must be at most 200 characters"],
    },
    categoryName: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      maxlength: [120, "Category name must be at most 120 characters"],
    },
    customerName: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
      maxlength: [200, "Customer name must be at most 200 characters"],
    },
    sellingDate: {
      type: Date,
      required: [true, "Selling date is required"],
    },
    quantity: {
      type: Number,
      required: [true, "Product quantity is required"],
      min: [1, "Product quantity must be at least 1"],
    },
    unitPrice: {
      type: Number,
      required: [true, "Product price per each is required"],
      min: [0, "Product price per each cannot be negative"],
    },
    totalPrice: {
      type: Number,
      required: [true, "Total price is required"],
      min: [0, "Total price cannot be negative"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Selling", sellingSchema);
