const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const cartRoutes = require("./routes/cart.routes");
const categoryRoutes = require("./routes/category.routes");
const creditSaleRoutes = require("./routes/creditSale.routes");
const customerRoutes = require("./routes/customer.routes");
const ecommerceSettingRoutes = require("./routes/ecommerceSetting.routes");
const productRoutes = require("./routes/product.routes");
const publicSeoRoutes = require("./routes/publicSeo.routes");
const returnsRoutes = require("./routes/returns.routes");
const seoRoutes = require("./routes/seo.routes");
const sellingRoutes = require("./routes/selling.routes");
const websiteImageRoutes = require("./routes/websiteImage.routes");
const websiteOrderRoutes = require("./routes/websiteOrder.routes");
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
app.use("/api/cart", cartRoutes);
app.use("/api/credit-sales", creditSaleRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/ecommerce-settings", ecommerceSettingRoutes);
app.use("/api/products", productRoutes);
app.use("/api/public", publicSeoRoutes);
app.use("/api/returns", returnsRoutes);
app.use("/api/seo", seoRoutes);
app.use("/api/sellings", sellingRoutes);
app.use("/api/website-images", websiteImageRoutes);
app.use("/api/website-orders", websiteOrderRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
