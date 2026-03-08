const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const categoryRoutes = require("./routes/category.routes");
const customerRoutes = require("./routes/customer.routes");
const productRoutes = require("./routes/product.routes");
const sellingRoutes = require("./routes/selling.routes");
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
app.use("/api/customers", customerRoutes);
app.use("/api/products", productRoutes);
app.use("/api/sellings", sellingRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
