const mongoose = require("mongoose");
const isBase64Image = require("../utils/isBase64Image");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      unique: true,
      maxlength: [120, "Category name must be at most 120 characters"],
    },
    image: {
      type: String,
      required: [true, "Category image is required"],
      trim: true,
      validate: {
        validator: isBase64Image,
        message:
          "Category image must be a valid base64 string (raw or data URI format)",
      },
    },
    description: {
      type: String,
      required: [true, "Category description is required"],
      trim: true,
      maxlength: [500, "Category description must be at most 500 characters"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Category", categorySchema);
