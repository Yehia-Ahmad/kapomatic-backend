const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const categoryRoutes = require("./routes/category.routes");
const productRoutes = require("./routes/product.routes");
const notFound = require("./middlewares/notFound.middleware");
const errorHandler = require("./middlewares/error.middleware");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.json({ message: "Warehouse API is running" });
});

app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
