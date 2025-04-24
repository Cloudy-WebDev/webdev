const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'sec2_gr7_database.sqlite');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) console.error('Database connection error:', err.message);
  else console.log(`Connected to SQLite database at ${dbPath}`);
});

// Database Server
function runAsync(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// Database Client
function getAsync(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

// Database Client (all)
function allAsync(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// Database API

// Admin
async function getAdminByEmail(email) {
  const sql = 'SELECT Email, Password FROM Admin WHERE Email = ?';
  return getAsync(sql, [email]);
}

// Admin Profile
async function getAdminProfile(email) {
    const sql = `SELECT FirstName, LastName, Dob, Address, Email FROM Profile WHERE Email = ?`;
    return getAsync(sql, [email]);
}

// Admin Profile
async function saveAdminProfile(profileData) {
    const { firstName, lastName, dob, address, email } = profileData;
    const existingProfile = await getAdminProfile(email);
    if (existingProfile && existingProfile.Email) {
        const updateSql = `UPDATE Profile SET FirstName = ?, LastName = ?, Dob = ?, Address = ? WHERE Email = ?`;
        return runAsync(updateSql, [firstName, lastName, dob, address, email]);
    } else {
        const insertSql = `INSERT INTO Profile (FirstName, LastName, Dob, Address, Email) VALUES (?, ?, ?, ?, ?)`;
        return runAsync(insertSql, [firstName, lastName, dob, address, email]);
    }
}

// Products
async function addProductWithImage(productData, imageName) {
    const { ProductID, ProductName, FullProductName, Details, Description, Price, Category } = productData;
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION;', async (beginErr) => {
                 if (beginErr) return reject(beginErr);
                 try {
                    const productSql = 'INSERT INTO Product (ProductID, ProductName, FullProductName, Details, Description, Price, Category) VALUES (?, ?, ?, ?, ?, ?, ?)';
                    await runAsync(productSql, [ProductID, ProductName, FullProductName, Details, Description, Price, Category]);
                    if (imageName) {
                        const imageSql = 'INSERT INTO ProductInfo (ProductID, Image) VALUES (?, ?)';
                        await runAsync(imageSql, [ProductID, imageName]);
                    }
                    db.run('COMMIT;', (commitErr) => {
                        if (commitErr) return reject(commitErr);
                        resolve({ message: `Product ${ProductID} added.` });
                    });
                 } catch (err) {
                     db.run('ROLLBACK;');
                     reject(err);
                 }
            });
        });
    });
}

// Delete product
async function deleteProductAndInfo(productID) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION;', async (beginErr) => {
                 if (beginErr) return reject(beginErr);
                 try {
                    const infoResult = await runAsync('DELETE FROM ProductInfo WHERE ProductID = ?', [productID]);
                    const productResult = await runAsync('DELETE FROM Product WHERE ProductID = ?', [productID]);
                    if (productResult.changes === 0 && infoResult.changes === 0) {
                         db.run('ROLLBACK;');
                         const notFoundError = new Error('Product not found.');
                         notFoundError.status = 404;
                         return reject(notFoundError);
                    }
                    db.run('COMMIT;', (commitErr) => {
                        if (commitErr) return reject(commitErr);
                        resolve({ changes: productResult.changes + infoResult.changes });
                    });
                 } catch (err) {
                     db.run('ROLLBACK;');
                     reject(err);
                 }
            });
        });
    });
}

// Pagination
async function getProductsPaginated(page = 1, itemsPerPage = 25) {
    const offset = (page - 1) * itemsPerPage;
    const dataQuery = `SELECT p.*, (SELECT Image FROM ProductInfo pi WHERE pi.ProductID = p.ProductID LIMIT 1) AS Image FROM Product p ORDER BY p.ProductName LIMIT ? OFFSET ?`;
    return allAsync(dataQuery, [itemsPerPage, offset]);
}

// Count
async function countTotalProducts() {
    const countQuery = 'SELECT COUNT(*) AS count FROM Product';
    const result = await getAsync(countQuery);
    return result ? result.count : 0;
}

// Get all products
async function getAllProducts() {
    const dataQuery = `SELECT p.*, (SELECT Image FROM ProductInfo pi WHERE pi.ProductID = p.ProductID LIMIT 1) AS Image FROM Product p ORDER BY p.ProductName`;
    return allAsync(dataQuery);
}

// Get product by ID
async function getProductById(productID) {
    const query = `SELECT p.*, (SELECT Image FROM ProductInfo pi WHERE pi.ProductID = p.ProductID LIMIT 1) AS Image FROM Product p WHERE p.ProductID = ?`;
    return getAsync(query, [productID]);
}

// Get product images
async function getProductImages(productID) {
    const query = `SELECT Image FROM ProductInfo WHERE ProductID = ? ORDER BY rowid`;
    const rows = await allAsync(query, [productID]);
    return rows.map(r => r.Image);
}

// Debug
async function runDebugQuery(query) {
    console.warn('Executing raw debug query:', query);
    const lowerQuery = query.toLowerCase().trim();
    if (query.includes(';') && !lowerQuery.startsWith('pragma') && (query.match(/;/g) || []).length > 1) {
        throw new Error('Multi-statement queries are not allowed.');
    }
    if (lowerQuery.startsWith('select') || lowerQuery.startsWith('pragma')) {
        return allAsync(query);
    } else if (lowerQuery.startsWith('insert') || lowerQuery.startsWith('update') || lowerQuery.startsWith('delete') || lowerQuery.startsWith('create') || lowerQuery.startsWith('drop') || lowerQuery.startsWith('alter')) {
        return runAsync(query);
    } else {
        throw new Error('Unsupported query type for debug execution.');
    }
}

// Export for talking with app.js
module.exports = {
    db,
    getAdminByEmail,
    getAdminProfile,
    saveAdminProfile,
    addProductWithImage,
    deleteProductAndInfo,
    getProductsPaginated,
    countTotalProducts,
    getAllProducts,
    getProductById,
    getProductImages,
    runDebugQuery
};