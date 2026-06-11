import fs from "fs";
import path from "path";
import mongoose from "mongoose";

// --- ENVIRONMENT CONFIG ---
const MONGODB_URI = process.env.MONGODB_URI;
const IS_MONGO = !!MONGODB_URI;

// Local JSON path (root folder of the project)
const LOCAL_DB_PATH = path.join(process.cwd(), "db.json");

// --- MONGOOSE MONGO SCHEMAS ---
let MongoOrder, MongoStock, MongoFamilyAccount, MongoClient, MongoMemberProfile;

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

  const FamilyAccountSchema = new mongoose.Schema({
    service: { type: String, required: true, enum: ["tidal", "deezer", "qobuz"] },
    masterEmail: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    notes: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now }
  });

  const ClientSchema = new mongoose.Schema({
    nickname: { type: String, default: "Cliente Nuevo" },
    currentWhatsApp: { type: String, required: true },
    pastWhatsApps: [{ type: String }],
    usedEmails: [{ type: String }],
    notes: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now }
  });

  const MemberProfileSchema = new mongoose.Schema({
    familyAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "FamilyAccount", required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client", default: null },
    memberEmail: { type: String, required: true },
    emailType: { type: String, required: true, enum: ["client", "admin"], default: "client" },
    memberPassword: { type: String, required: true },
    pricePen: { type: Number, default: 0 },
    renewalDate: { type: Date, default: null },
    status: { 
      type: String, 
      required: true, 
      enum: ["active", "expired", "pending_payment", "free"], 
      default: "free" 
    },
    updatedAt: { type: Date, default: Date.now }
  });

  MongoOrder = mongoose.models.Order || mongoose.model("Order", OrderSchema);
  MongoStock = mongoose.models.Stock || mongoose.model("Stock", StockSchema);
  MongoFamilyAccount = mongoose.models.FamilyAccount || mongoose.model("FamilyAccount", FamilyAccountSchema);
  MongoClient = mongoose.models.Client || mongoose.model("Client", ClientSchema);
  MongoMemberProfile = mongoose.models.MemberProfile || mongoose.model("MemberProfile", MemberProfileSchema);
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
      const initialData = { orders: {}, stock: [], familyAccounts: {}, clients: {}, memberProfiles: {} };
      fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(initialData, null, 2), "utf8");
      return initialData;
    }
    const data = fs.readFileSync(LOCAL_DB_PATH, "utf8");
    return JSON.parse(data || '{"orders": {}, "stock": [], "familyAccounts": {}, "clients": {}, "memberProfiles": {}}');
  } catch (error) {
    console.error("Error reading local JSON database:", error);
    return { orders: {}, stock: [], familyAccounts: {}, clients: {}, memberProfiles: {} };
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

// --- FAMILY ACCOUNTS CRUD ---

export async function getFamilyAccounts() {
  await initDb();
  if (IS_MONGO) {
    const list = await MongoFamilyAccount.find().sort({ createdAt: -1 });
    return list.map(a => a.toObject());
  } else {
    const db = readLocalDb();
    if (!db.familyAccounts) db.familyAccounts = {};
    return Object.values(db.familyAccounts).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

export async function getFamilyAccountById(id) {
  await initDb();
  if (IS_MONGO) {
    const acc = await MongoFamilyAccount.findById(id);
    return acc ? acc.toObject() : null;
  } else {
    const db = readLocalDb();
    if (!db.familyAccounts) db.familyAccounts = {};
    return db.familyAccounts[id] || null;
  }
}

export async function createFamilyAccount(accountData) {
  await initDb();
  if (IS_MONGO) {
    const newAcc = new MongoFamilyAccount(accountData);
    await newAcc.save();
    return newAcc.toObject();
  } else {
    const db = readLocalDb();
    if (!db.familyAccounts) db.familyAccounts = {};
    const id = "acc_" + Math.random().toString(36).substr(2, 9);
    const newAcc = { id, createdAt: new Date().toISOString(), ...accountData };
    db.familyAccounts[id] = newAcc;
    writeLocalDb(db);
    return newAcc;
  }
}

export async function updateFamilyAccount(id, updatedFields) {
  await initDb();
  if (IS_MONGO) {
    const acc = await MongoFamilyAccount.findByIdAndUpdate(
      id,
      { $set: updatedFields },
      { new: true }
    );
    return acc ? acc.toObject() : null;
  } else {
    const db = readLocalDb();
    if (!db.familyAccounts || !db.familyAccounts[id]) return null;
    db.familyAccounts[id] = { ...db.familyAccounts[id], ...updatedFields };
    writeLocalDb(db);
    return db.familyAccounts[id];
  }
}

export async function deleteFamilyAccount(id) {
  await initDb();
  if (IS_MONGO) {
    await MongoFamilyAccount.findByIdAndDelete(id);
    await MongoMemberProfile.deleteMany({ familyAccountId: id });
  } else {
    const db = readLocalDb();
    if (db.familyAccounts && db.familyAccounts[id]) {
      delete db.familyAccounts[id];
      if (db.memberProfiles) {
        Object.keys(db.memberProfiles).forEach(pid => {
          if (db.memberProfiles[pid].familyAccountId === id) {
            delete db.memberProfiles[pid];
          }
        });
      }
      writeLocalDb(db);
    }
  }
}

// --- CLIENTS CRUD & SEARCH ---

export async function getClients() {
  await initDb();
  if (IS_MONGO) {
    const list = await MongoClient.find().sort({ createdAt: -1 });
    return list.map(c => c.toObject());
  } else {
    const db = readLocalDb();
    if (!db.clients) db.clients = {};
    return Object.values(db.clients).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

export async function getClientById(id) {
  await initDb();
  if (IS_MONGO) {
    const client = await MongoClient.findById(id);
    return client ? client.toObject() : null;
  } else {
    const db = readLocalDb();
    if (!db.clients) db.clients = {};
    return db.clients[id] || null;
  }
}

export async function createClient(clientData) {
  await initDb();
  if (IS_MONGO) {
    const newClient = new MongoClient(clientData);
    await newClient.save();
    return newClient.toObject();
  } else {
    const db = readLocalDb();
    if (!db.clients) db.clients = {};
    const id = "cli_" + Math.random().toString(36).substr(2, 9);
    const newClient = { id, createdAt: new Date().toISOString(), pastWhatsApps: [], usedEmails: [], ...clientData };
    db.clients[id] = newClient;
    writeLocalDb(db);
    return newClient;
  }
}

export async function updateClient(id, updatedFields) {
  await initDb();
  if (IS_MONGO) {
    const client = await MongoClient.findByIdAndUpdate(
      id,
      { $set: updatedFields },
      { new: true }
    );
    return client ? client.toObject() : null;
  } else {
    const db = readLocalDb();
    if (!db.clients || !db.clients[id]) return null;
    db.clients[id] = { ...db.clients[id], ...updatedFields };
    writeLocalDb(db);
    return db.clients[id];
  }
}

export async function searchClients(query) {
  await initDb();
  const regexQuery = query.trim();
  if (!regexQuery) return [];

  if (IS_MONGO) {
    const list = await MongoClient.find({
      $or: [
        { nickname: { $regex: regexQuery, $options: "i" } },
        { currentWhatsApp: { $regex: regexQuery } },
        { pastWhatsApps: { $regex: regexQuery } },
        { usedEmails: { $regex: regexQuery, $options: "i" } }
      ]
    });
    return list.map(c => c.toObject());
  } else {
    const db = readLocalDb();
    if (!db.clients) db.clients = {};
    const q = regexQuery.toLowerCase();
    return Object.values(db.clients).filter(c => {
      const matchName = c.nickname && c.nickname.toLowerCase().includes(q);
      const matchPhone = c.currentWhatsApp && c.currentWhatsApp.includes(q);
      const matchPastPhone = c.pastWhatsApps && c.pastWhatsApps.some(phone => phone.includes(q));
      const matchEmail = c.usedEmails && c.usedEmails.some(email => email.toLowerCase().includes(q));
      return matchName || matchPhone || matchPastPhone || matchEmail;
    });
  }
}

// --- MEMBER PROFILES CRUD ---

export async function getMemberProfiles(filters = {}) {
  await initDb();
  if (IS_MONGO) {
    const query = {};
    if (filters.familyAccountId) query.familyAccountId = filters.familyAccountId;
    if (filters.status) query.status = filters.status;
    
    const list = await MongoMemberProfile.find(query)
      .populate("familyAccountId")
      .populate("clientId")
      .sort({ updatedAt: -1 });
    return list.map(p => p.toObject());
  } else {
    const db = readLocalDb();
    if (!db.memberProfiles) db.memberProfiles = {};
    let list = Object.values(db.memberProfiles);
    
    if (filters.familyAccountId) {
      list = list.filter(p => p.familyAccountId === filters.familyAccountId);
    }
    if (filters.status) {
      list = list.filter(p => p.status === filters.status);
    }
    
    return list.map(p => {
      const familyAccount = db.familyAccounts ? db.familyAccounts[p.familyAccountId] : null;
      const client = db.clients && p.clientId ? db.clients[p.clientId] : null;
      return {
        ...p,
        familyAccountId: familyAccount || p.familyAccountId,
        clientId: client || p.clientId
      };
    }).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
}

export async function getMemberProfileById(id) {
  await initDb();
  if (IS_MONGO) {
    const profile = await MongoMemberProfile.findById(id).populate("familyAccountId").populate("clientId");
    return profile ? profile.toObject() : null;
  } else {
    const db = readLocalDb();
    if (!db.memberProfiles || !db.memberProfiles[id]) return null;
    const p = db.memberProfiles[id];
    const familyAccount = db.familyAccounts ? db.familyAccounts[p.familyAccountId] : null;
    const client = db.clients && p.clientId ? db.clients[p.clientId] : null;
    return {
      ...p,
      familyAccountId: familyAccount || p.familyAccountId,
      clientId: client || p.clientId
    };
  }
}

export async function createMemberProfile(profileData) {
  await initDb();
  if (IS_MONGO) {
    const newProfile = new MongoMemberProfile(profileData);
    await newProfile.save();
    return newProfile.toObject();
  } else {
    const db = readLocalDb();
    if (!db.memberProfiles) db.memberProfiles = {};
    const id = "prof_" + Math.random().toString(36).substr(2, 9);
    const newProfile = { id, updatedAt: new Date().toISOString(), ...profileData };
    db.memberProfiles[id] = newProfile;
    writeLocalDb(db);
    return newProfile;
  }
}

export async function updateMemberProfile(id, updatedFields) {
  await initDb();
  if (IS_MONGO) {
    const profile = await MongoMemberProfile.findByIdAndUpdate(
      id,
      { $set: { ...updatedFields, updatedAt: new Date() } },
      { new: true }
    );
    return profile ? profile.toObject() : null;
  } else {
    const db = readLocalDb();
    if (!db.memberProfiles || !db.memberProfiles[id]) return null;
    db.memberProfiles[id] = {
      ...db.memberProfiles[id],
      ...updatedFields,
      updatedAt: new Date().toISOString()
    };
    writeLocalDb(db);
    return db.memberProfiles[id];
  }
}

export async function deleteMemberProfile(id) {
  await initDb();
  if (IS_MONGO) {
    await MongoMemberProfile.findByIdAndDelete(id);
  } else {
    const db = readLocalDb();
    if (db.memberProfiles && db.memberProfiles[id]) {
      delete db.memberProfiles[id];
      writeLocalDb(db);
    }
  }
}

// --- UTILITY BUSINESS LOGIC FUNCTIONS ---

/**
 * Calcula la fecha de renovación sumando meses e implementando el ajuste del día 31.
 * @param {Date|string} purchaseDate - Fecha en la que se realiza la compra
 * @param {number} monthsToAdd - Duración del plan contratado (en meses)
 * @returns {Date} Fecha de renovación calculada
 */
export function calculateRenewalDate(purchaseDate, monthsToAdd) {
  let date = new Date(purchaseDate);
  const day = date.getDate();
  
  // Regla especial: si la compra cae día 31, se desplaza al día 1 del siguiente mes
  if (day === 31) {
    date.setDate(1);
    date.setMonth(date.getMonth() + 1);
  }
  
  // Sumar la duración en meses
  date.setMonth(date.getMonth() + monthsToAdd);
  return date;
}

const COUNTRY_MAP = {
  "51": { code: "PE", name: "Perú", flag: "🇵🇪" },
  "54": { code: "AR", name: "Argentina", flag: "🇦🇷" },
  "56": { code: "CL", name: "Chile", flag: "🇨🇱" },
  "57": { code: "CO", name: "Colombia", flag: "🇨🇴" },
  "52": { code: "MX", name: "México", flag: "🇲🇽" },
  "34": { code: "ES", name: "España", flag: "🇪🇸" },
  "58": { code: "VE", name: "Venezuela", flag: "🇻🇪" },
  "591": { code: "BO", name: "Bolivia", flag: "🇧🇴" },
  "593": { code: "EC", name: "Ecuador", flag: "🇪🇨" },
  "502": { code: "GT", name: "Guatemala", flag: "🇬🇹" }
};

/**
 * Obtiene el país y la bandera a partir del prefijo del teléfono
 * @param {string} phoneNumber - Número de WhatsApp completo
 * @returns {Object} Datos del país
 */
export function getCountryFromPhone(phoneNumber) {
  if (!phoneNumber) return { code: "INT", name: "Otro / Internacional", flag: "🌐" };
  const cleanPhone = phoneNumber.replace(/\D/g, ""); // Dejar solo números
  
  // Probar prefijos de 3 dígitos primero
  const prefix3 = cleanPhone.substring(0, 3);
  if (COUNTRY_MAP[prefix3]) return COUNTRY_MAP[prefix3];
  
  // Probar prefijos de 2 dígitos
  const prefix2 = cleanPhone.substring(0, 2);
  if (COUNTRY_MAP[prefix2]) return COUNTRY_MAP[prefix2];
  
  return { code: "INT", name: "Otro / Internacional", flag: "🌐" };
}
