const mongoose = require("mongoose");
const isBase64Image = require("../utils/isBase64Image");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      maxlength: [200, "Product name must be at most 200 characters"],
    },
    inventoryCount: {
      type: Number,
      required: [true, "Product count in inventory is required"],
      min: [0, "Inventory count cannot be negative"],
    },
    image: {
      type: String,
      required: [true, "Product image is required"],
      trim: true,
      validate: {
        validator: isBase64Image,
        message:
          "Product image must be a valid base64 string (raw or data URI format)",
      },
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category ID is required"],
    },
    wholesalePrice: {
      type: Number,
      required: [true, "Wholesale price is required"],
      min: [0, "Wholesale price cannot be negative"],
    },
    retailPrice: {
      type: Number,
      required: [true, "Retail price is required"],
      min: [0, "Retail price cannot be negative"],
      validate: {
        validator: function validateRetailPrice(value) {
          return value >= this.wholesalePrice;
        },
        message: "Retail price must be greater than or equal to wholesale price",
      },
    },
    soldItemCount: {
      type: Number,
      default: 0,
      min: [0, "Sold item count cannot be negative"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
