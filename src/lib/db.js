import fs from "fs";
import path from "path";
import mongoose from "mongoose";

// --- ENVIRONMENT CONFIG ---
const MONGODB_URI = process.env.MONGODB_URI;
const IS_MONGO = !!MONGODB_URI;

// Local JSON path (root folder of the project)
const LOCAL_DB_PATH = path.join(process.cwd(), "db.json");

// --- MONGOOSE MONGO SCHEMAS ---
let MongoOrder, MongoStock;

if (IS_MONGO) {
  const OrderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    whatsapp: { type: String, required: true },
    service: { type: String, required: true },
    duration: { type: String, required: true },
    pricePen: { type: String, required: true },
    priceUsd: { type: String, required: true },
    paymentMethod: { type: String, required: true },
    status: { type: String, required: true, enum: ["pending", "paid", "expired", "failed"] },
    assignedAccount: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  const StockSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    service: { type: String, required: true },
    accountData: { type: String, required: true },
    isUsed: { type: Boolean, default: false },
    assignedToOrder: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
  });

  MongoOrder = mongoose.models.Order || mongoose.model("Order", OrderSchema);
  MongoStock = mongoose.models.Stock || mongoose.model("Stock", StockSchema);
}

// --- MONGO CONNECTION HELPER ---
async function connectMongo() {
  if (mongoose.connection.readyState >= 1) return;
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB successfully.");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
}

// --- LOCAL JSON FILE HELPER ---
function readLocalDb() {
  try {
    if (!fs.existsSync(LOCAL_DB_PATH)) {
      const initialData = { orders: {}, stock: [] };
      fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(initialData, null, 2), "utf8");
      return initialData;
    }
    const data = fs.readFileSync(LOCAL_DB_PATH, "utf8");
    return JSON.parse(data || '{"orders": {}, "stock": []}');
  } catch (error) {
    console.error("Error reading local JSON database:", error);
    return { orders: {}, stock: [] };
  }
}

function writeLocalDb(data) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Error writing to local JSON database:", error);
  }
}

// --- DATABASE INTERFACE FUNCTIONS ---

export async function initDb() {
  if (IS_MONGO) {
    await connectMongo();
  } else {
    readLocalDb(); // Ensure file exists
  }
}

// --- ORDERS API ---

export async function getOrders() {
  await initDb();
  if (IS_MONGO) {
    const list = await MongoOrder.find().sort({ createdAt: -1 });
    return list.map(o => o.toObject());
  } else {
    const db = readLocalDb();
    // Return sorted by date
    return Object.values(db.orders).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

export async function getOrderById(orderId) {
  await initDb();
  if (IS_MONGO) {
    const order = await MongoOrder.findOne({ orderId });
    return order ? order.toObject() : null;
  } else {
    const db = readLocalDb();
    return db.orders[orderId] || null;
  }
}

export async function createOrder(orderData) {
  await initDb();
  if (IS_MONGO) {
    const newOrder = new MongoOrder(orderData);
    await newOrder.save();
    return newOrder.toObject();
  } else {
    const db = readLocalDb();
    db.orders[orderData.orderId] = orderData;
    writeLocalDb(db);
    return orderData;
  }
}

export async function updateOrder(orderId, updatedFields) {
  await initDb();
  if (IS_MONGO) {
    const order = await MongoOrder.findOneAndUpdate(
      { orderId },
      { $set: { ...updatedFields, updatedAt: new Date() } },
      { new: true }
    );
    return order ? order.toObject() : null;
  } else {
    const db = readLocalDb();
    if (!db.orders[orderId]) return null;
    db.orders[orderId] = {
      ...db.orders[orderId],
      ...updatedFields,
      updatedAt: new Date().toISOString()
    };
    writeLocalDb(db);
    return db.orders[orderId];
  }
}

// --- STOCK API ---

export async function getStock() {
  await initDb();
  if (IS_MONGO) {
    const stock = await MongoStock.find();
    return stock.map(s => s.toObject());
  } else {
    const db = readLocalDb();
    return db.stock;
  }
}

export async function addStockItems(items) {
  await initDb();
  // items: array of { id, service, accountData }
  if (IS_MONGO) {
    await MongoStock.insertMany(items);
  } else {
    const db = readLocalDb();
    db.stock.push(...items);
    writeLocalDb(db);
  }
}

export async function deleteStockItem(id) {
  await initDb();
  if (IS_MONGO) {
    await MongoStock.deleteOne({ id });
  } else {
    const db = readLocalDb();
    db.stock = db.stock.filter(item => item.id !== id);
    writeLocalDb(db);
  }
}

// Assigns an unused account from stock to a given order
export async function assignStockAccount(orderId, service) {
  await initDb();
  if (IS_MONGO) {
    // Find one unused account for this service
    const account = await MongoStock.findOne({ service, isUsed: false });
    if (!account) return null;

    // Mark it as used and assign
    account.isUsed = true;
    account.assignedToOrder = orderId;
    await account.save();

    // Update the order with this account
    await MongoOrder.findOneAndUpdate(
      { orderId },
      { $set: { assignedAccount: account.accountData } }
    );

    return account.accountData;
  } else {
    const db = readLocalDb();
    // Find index of unused account
    const accountIdx = db.stock.findIndex(item => item.service === service && !item.isUsed);
    if (accountIdx === -1) return null;

    // Update stock item
    db.stock[accountIdx].isUsed = true;
    db.stock[accountIdx].assignedToOrder = orderId;

    const accountData = db.stock[accountIdx].accountData;

    // Update order
    if (db.orders[orderId]) {
      db.orders[orderId].assignedAccount = accountData;
    }

    writeLocalDb(db);
    return accountData;
  }
}
