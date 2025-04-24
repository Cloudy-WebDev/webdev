const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs').promises;
const session = require('express-session');
const cookieParser = require('cookie-parser');
const SQLiteStore = require('connect-sqlite3')(session); // For persistent sessions
const bcrypt = require('bcrypt'); // For password hashing

// --- Configuration ---
// !! IMPORTANT !! Define the path for persistent data (database, uploads)
// This should point to a location on your Render Persistent Disk.
// Example: If disk is mounted at /data, store data in /data/appdata
const persistentDataPath = process.env.PERSISTENT_DATA_PATH || path.join('/data', 'appdata'); // Use env var or default to /data/appdata
const dbDirectory = persistentDataPath; // Database directory is the persistent path
const dbFileName = 'sec2_gr7_database.sqlite'; // Your database file name
const dbFilePath = path.join(dbDirectory, dbFileName); // Full path to the database file
const picturesDirectory = path.join(persistentDataPath, 'pictures'); // Pictures stored in the persistent path
const saltRounds = 10; // Cost factor for bcrypt hashing

// Ensure persistent directories exist (run once on startup)
async function ensureDirectories() {
    try {
        await fs.mkdir(dbDirectory, { recursive: true });
        await fs.mkdir(picturesDirectory, { recursive: true });
        console.log(`Persistent data directories ensured at: ${persistentDataPath}`);
        console.log(` -> Database expected at: ${dbFilePath}`);
        console.log(` -> Pictures expected at: ${picturesDirectory}`);
    } catch (err) {
        console.error('FATAL: Could not create persistent data directories.', err);
        // Depending on the error, you might want to exit if storage isn't writable
        // process.exit(1);
    }
}

// Import database server API functions
// !! IMPORTANT !! Ensure database.js uses the *exact same* dbFilePath
const dbAPI = require('./database');

// Setup
const app = express();
const router = express.Router();

// --- Middleware ---
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Configuration with SQLiteStore
app.use(session({
    store: new SQLiteStore({
        db: dbFileName, // Just the filename
        dir: dbDirectory, // Directory where the DB file is located
        table: 'sessions', // Optional: table name, defaults to 'sessions'
        concurrentDB: true // Recommended for SQLite stores
    }),
    secret: process.env.SESSION_SECRET || 'fallback_secret_key_12345_replace_this_in_prod', // !! SET IN RENDER ENV VARS !!
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Should be true in production (Render HTTPS)
        maxAge: 1000 * 60 * 60 * 24, // 1 day
        httpOnly: true, // Prevent client-side JS access
        sameSite: 'lax' // Good practice for CSRF protection
    }
}));

// Multer Setup for File Uploads (using persistent path)
const storage = multer.diskStorage({
    destination: picturesDirectory, // Save uploads to persistent disk
    filename: (req, file, cb) => {
        const productId = req.body.ProductID || 'unknown_product';
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `${productId}-${uniqueSuffix}${ext}`);
         if (!req.body.ProductID) {
             console.warn('ProductID missing during upload:', file.originalname);
         }
    },
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const mimetype = allowedTypes.test(file.mimetype);
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) return cb(null, true);
        cb(new Error('Error: Invalid file type. Only JPEG, PNG, GIF allowed.'));
    }
}).single('productImage');

// Static Files
// Serve HTML/JS/Assets from the standard project structure
app.use(express.static(path.join(__dirname, 'html')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
// Serve uploaded images from the persistent pictures directory
app.use('/images', express.static(picturesDirectory));

// --- Authentication Middleware ---
function requireAdminLogin(req, res, next) {
    if (req.session && req.session.isAdmin) {
        return next(); // User is authenticated
    } else {
        // Log details for easier debugging
        console.warn('Access Denied: Admin login required.', {
            path: req.originalUrl,
            ip: req.ip, // Note: May show proxy IP on Render, check headers like 'X-Forwarded-For' if needed
            sessionIdExists: !!req.sessionID,
            isAdminSet: req.session ? req.session.isAdmin : 'no session object'
         });
         // Redirect to login page with an error query parameter
        res.redirect('/adminlogin?error=unauthorized');
    }
}

// --- Routes ---

// Public Routes
router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'html', 'home.html')));
router.get('/home', (req, res) => res.sendFile(path.join(__dirname, 'html', 'home.html')));
router.get('/detail', (req, res) => res.sendFile(path.join(__dirname, 'html', 'detail.html')));
router.get('/search', (req, res) => res.sendFile(path.join(__dirname, 'html', 'search.html')));
router.get('/team', (req, res) => res.sendFile(path.join(__dirname, 'html', 'team.html')));
router.get('/allproduct', (req, res) => res.sendFile(path.join(__dirname, 'html', 'allproduct.html')));
router.get('/html/header.html', (req, res) => res.sendFile(path.join(__dirname, 'html', 'header.html')));
router.get('/html/footer.html', (req, res) => res.sendFile(path.join(__dirname, 'html', 'footer.html')));

// Admin Login/Logout Routes
router.get('/adminlogin', (req, res) => {
    // If already logged in, redirect to the product page
    if (req.session && req.session.isAdmin) {
       return res.redirect('/product');
    }
    // Otherwise, show the login page
    res.sendFile(path.join(__dirname, 'html', 'adminlogin.html'));
});

router.post('/admin/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        console.warn('Login attempt failed: Missing email or password.');
        return res.redirect('/adminlogin?error=missing');
    }

    try {
        const admin = await dbAPI.getAdminByEmail(email);
        if (!admin || !admin.Password) { // Check if admin exists and has a password field
            console.warn(`Login attempt failed: Admin not found or no password hash for email: ${email}`);
            return res.redirect('/adminlogin?error=invalid');
        }

        // Compare the submitted password with the stored hash
        const passwordMatch = await bcrypt.compare(password, admin.Password);

        if (passwordMatch) {
            // Passwords match! Regenerate session to prevent fixation attacks
            req.session.regenerate(err => {
                if (err) {
                    console.error('Session regeneration error during login:', err);
                    return res.redirect('/adminlogin?error=sessionerror');
                }
                // Set session variables
                req.session.isAdmin = true;
                req.session.email = admin.Email;
                console.log(`Admin login successful for email: ${email}`);
                // Save the session and redirect
                req.session.save(err => {
                    if (err) {
                        console.error('Session save error after login:', err);
                        return res.redirect('/adminlogin?error=sessionerror');
                    }
                    res.redirect('/product'); // Redirect to the admin product page
                });
            });
        } else {
            // Passwords don't match
            console.warn(`Login attempt failed: Invalid password for email: ${email}`);
            return res.redirect('/adminlogin?error=invalid');
        }
    } catch (err) {
        console.error('Admin login database/bcrypt error:', err);
        return res.redirect('/adminlogin?error=dberror');
    }
});

router.get('/admin/logout', (req, res) => {
    const userEmail = req.session.email; // Get email before destroying session
    req.session.destroy(err => {
        res.clearCookie('connect.sid'); // Clear the session cookie
        if (err) {
            console.error('Error destroying session during logout:', err);
            // Still redirect even if destroy fails, but log the error
            res.redirect('/adminlogin?logout=error');
        } else {
            console.log(`Admin logout successful for email: ${userEmail || 'unknown'}`);
            res.redirect('/adminlogin?logout=success');
        }
    });
});

// --- Admin Authenticated Routes ---
// Apply the requireAdminLogin middleware to all routes below this point in the router
router.use(requireAdminLogin); // Apply middleware for subsequent routes

router.get('/product', (req, res) => res.sendFile(path.join(__dirname, 'html', 'product.html')));
router.get('/adminaccount', (req, res) => res.sendFile(path.join(__dirname, 'html', 'adminaccount.html')));
router.get('/inventory', (req, res) => res.sendFile(path.join(__dirname, 'html', 'inventory.html')));
router.get('/admin/dashboard', (req, res) => res.redirect('/product')); // Redirect dashboard to product page
router.get('/debug', (req, res) => res.sendFile(path.join(__dirname, 'html', 'debug.html')));


// --- Product API Routes (Admin Only) ---

// Multer Error Handler Middleware (Specific to routes using 'upload')
function handleUploadErrors(err, req, res, next) {
    if (err instanceof multer.MulterError) {
        console.warn('Multer upload error:', err);
        return res.status(400).json({ error: `File upload error: ${err.message}` });
    } else if (err) { // Handle other errors from fileFilter etc.
        console.warn('File upload error:', err.message);
        return res.status(400).json({ error: err.message });
    }
    next(); // Proceed if no Multer-specific error
}

// Add Product (Protected by requireAdminLogin via router.use)
router.post('/add-product', (req, res, next) => {
    // Run multer upload middleware first
    upload(req, res, (err) => {
        // Then handle any upload errors
        handleUploadErrors(err, req, res, () => {
            // If no upload errors, proceed to the actual product handler
            addProductHandler(req, res);
        });
    });
});

// Add Product Logic (Protected)
async function addProductHandler(req, res) {
    const { ProductID, ProductName, FullProductName, Details, Description, Price, Category } = req.body;
    const imageName = req.file ? req.file.filename : null; // Get filename from multer

    // Basic validation
    if (!ProductID || !ProductName || !FullProductName || !Price || !Category) {
        console.warn('Add product failed: Missing required fields.', req.body);
        // If validation fails after upload, delete the orphaned file
        if (req.file) {
            fs.unlink(req.file.path).catch(err => console.error(`Error deleting orphaned upload ${req.file.path}:`, err));
        }
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    try {
        // Call database function to add product and image info
        const result = await dbAPI.addProductWithImage(req.body, imageName);
        console.log(`Product added successfully: ID ${ProductID}, Name: ${ProductName}`);
        res.status(201).json(result);
    } catch (err) {
        console.error(`Add product error for ID ${ProductID}:`, err);
        // Clean up uploaded file if DB insert fails
        if (req.file) {
            fs.unlink(req.file.path).catch(unlinkErr => console.error(`Error deleting upload after DB error ${req.file.path}:`, unlinkErr));
        }

        // Handle specific errors like unique constraint violation
        if (err.code === 'SQLITE_CONSTRAINT') {
             return res.status(409).json({ error: `Product with ID ${ProductID} already exists.`, details: err.message });
         }
        // Generic server error
        res.status(500).json({ error: 'Failed to add product.', details: err.message });
    }
}

// Delete Product (Protected)
router.delete('/api/products/:productID', async (req, res) => { // Note: requireAdminLogin already applied
    const { productID } = req.params;
    if (!productID) {
        return res.status(400).json({ error: 'Missing Product ID.' });
    }

    try {
        // Find associated image files first (using the persistent pictures directory)
        let matchingFiles = [];
        try {
            const files = await fs.readdir(picturesDirectory);
            // Regex to match files starting with ProductID-, followed by numbers, hyphen, numbers, and extension
            const filePattern = new RegExp(`^${productID}-\\d+-\\d+\\..+$`);
            matchingFiles = files.filter(file => filePattern.test(file));
        } catch (readErr) {
            // Ignore if directory doesn't exist, but log other errors
            if (readErr.code !== 'ENOENT') {
                console.warn(`Could not read pictures directory (${picturesDirectory}) during delete: ${readErr.message}`);
            }
        }

        // Delete associated image files from persistent storage
        const deleteFilePromises = matchingFiles.map(file => {
            const filePath = path.join(picturesDirectory, file);
            console.log(`Deleting associated image file: ${filePath}`);
            return fs.unlink(filePath).catch(err => console.error(`Error deleting file ${filePath}:`, err)); // Log errors but don't stop DB deletion
        });
        await Promise.all(deleteFilePromises);

        // Delete product from database
        await dbAPI.deleteProductAndInfo(productID);
        console.log(`Product ${productID} deleted successfully.`);
        res.json({ message: `Product ${productID} deleted successfully.` });

    } catch (err) {
        console.error(`Delete product error for ID ${productID}:`, err);
        if (err.status === 404) { // Check if dbAPI threw a specific 404 error
            return res.status(404).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to delete product.', details: err.message });
    }
});

// Debug Query (Protected)
router.post('/run-query', async (req, res) => { // Note: requireAdminLogin already applied
    const { query } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'Query cannot be empty.' });
    }

    try {
        console.log(`Running debug query by admin ${req.session.email}: ${query}`);
        const result = await dbAPI.runDebugQuery(query);
        res.json(result);
    } catch (err) {
        console.error('Debug query error:', err);
        res.status(400).json({ error: 'Failed to execute query.', details: err.message });
    }
});

// Admin Profile API (Protected)
router.get('/api/admin/profile', async (req, res) => { // Note: requireAdminLogin already applied
    const userEmail = req.session.email; // Already verified by middleware
    // No need to check userEmail again, middleware ensures it exists if we reach here

    try {
        const profile = await dbAPI.getAdminProfile(userEmail);
        if (profile) {
            res.json(profile);
        } else {
            // Send a clear indication that the profile doesn't exist yet
            res.json({ Email: userEmail, message: "Profile not yet created." });
        }
    } catch (err) {
        console.error(`Get admin profile error for ${userEmail}:`, err);
        res.status(500).json({ error: 'Failed to retrieve profile.' });
    }
});

router.post('/api/admin/profile', async (req, res) => { // Note: requireAdminLogin already applied
    const userEmail = req.session.email;
    const { firstName, lastName, dob, address } = req.body;

    // Basic validation
    if (!firstName || !lastName) {
        return res.status(400).json({ error: 'First name and last name are required.' });
    }

    try {
        const profileData = { firstName, lastName, dob, address, email: userEmail };
        const result = await dbAPI.saveAdminProfile(profileData);
        // Assuming saveAdminProfile indicates insert vs update (e.g., via changes or specific return value)
        // This depends on your dbAPI implementation. Adjust if needed.
        const message = result.changes > 0 ? 'Profile updated successfully' : 'Profile created successfully';
        const status = result.changes > 0 ? 200 : 201; // OK for update, Created for new
        console.log(`Admin profile saved/updated for ${userEmail}`);
        res.status(status).json({ message });
    } catch (err) {
        console.error(`Save admin profile error for ${userEmail}:`, err);
        res.status(500).json({ error: 'Failed to save profile.', details: err.message });
    }
});


// --- Public Product API Routes ---
// These are mounted directly on 'app', not 'router', so they don't inherit requireAdminLogin

// Get Paginated Products (Public)
app.get('/api/products', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const itemsPerPage = parseInt(req.query.limit) || 25; // Default 25 items

    // Validate pagination parameters
    if (page < 1 || itemsPerPage < 1 || itemsPerPage > 100) { // Limit max items per page
        return res.status(400).json({ error: 'Invalid pagination parameters. Page must be >= 1, limit must be between 1 and 100.' });
    }

    try {
        // Fetch total count and paginated products concurrently
        const [totalProducts, products] = await Promise.all([
            dbAPI.countTotalProducts(),
            dbAPI.getProductsPaginated(page, itemsPerPage)
        ]);
        const totalPages = Math.ceil(totalProducts / itemsPerPage);

        res.json({
            products,
            currentPage: page,
            totalPages,
            totalProducts,
            itemsPerPage
        });
    } catch (err) {
        console.error('Get paginated products error:', err);
        res.status(500).json({ error: 'Failed to retrieve products.', details: err.message });
    }
});

// Get All Products (Public - Use with caution, might be large)
app.get('/api/products/all', async (req, res) => {
    try {
        console.warn('/api/products/all endpoint called. This might return a large dataset.'); // Add a warning
        const products = await dbAPI.getAllProducts();
        res.json({ products });
    } catch (err) {
        console.error('Get all products error:', err);
        res.status(500).json({ error: 'Failed to retrieve all products.', details: err.message });
    }
});

// Get Single Product by ID (Public)
app.get('/api/products/:productID', async (req, res) => {
    const { productID } = req.params;
    if (!productID) {
        return res.status(400).json({ error: 'Product ID required.' });
    }

    try {
        const product = await dbAPI.getProductById(productID);
        if (product) {
            res.json(product);
        } else {
            res.status(404).json({ message: 'Product not found' });
        }
    } catch (err) {
        console.error(`Get product by ID error (${productID}):`, err);
        res.status(500).json({ error: 'Failed to retrieve product.', details: err.message });
    }
});

// Get Product Images (Public)
app.get('/api/product_images/:productID', async (req, res) => {
    const { productID } = req.params;
    if (!productID) {
        return res.status(400).json({ error: 'Product ID required.' });
    }

    try {
        const images = await dbAPI.getProductImages(productID);
        // Ensure images is always an array, even if empty
        res.json(images || []);
    } catch (err) {
        console.error(`Get product images error (${productID}):`, err);
        res.status(500).json({ error: 'Failed to retrieve images.', details: err.message });
    }
});


// --- Final Setup ---

// Mount the router (contains all non-API routes and admin API routes)
app.use('/', router);

// 404 Handler (Catch-all for routes not matched)
app.use((req, res, next) => {
    res.status(404).type('text/plain').send('404 Not Found');
});

// Global Error Handler (Catches errors passed via next(err))
app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err.stack || err); // Log the full error stack
    const statusCode = err.status || 500;
    // Send generic message in production, detailed error otherwise
    const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message;
    res.status(statusCode).json({
          error: message,
          // Optionally include stack trace in development/non-production
          ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
      });
});

// --- Server Start ---
const PORT = process.env.PORT || 10000; // Use Render's PORT env var, default to 10000

// Ensure directories exist before starting the server
ensureDirectories().then(() => {
    app.listen(PORT, () => {
        console.log(`-------------------------------------------------------`);
        console.log(`Server running on port ${PORT}`);
        console.log(`Environment (NODE_ENV): ${process.env.NODE_ENV || 'development (default)'}`);
        console.log(`Session Secret Loaded: ${process.env.SESSION_SECRET ? 'Yes (from env)' : 'No (using fallback - insecure!)'}`);
        console.log(`Secure Cookies: ${process.env.NODE_ENV === 'production'}`);
        console.log(`Persistent Data Path: ${persistentDataPath}`);
        console.log(`Database File Path: ${dbFilePath}`);
        console.log(`-------------------------------------------------------`);
    });
}).catch(err => {
    console.error("FATAL: Failed to initialize persistent storage. Server not started.", err);
    process.exit(1); // Exit if storage setup fails
});


// --- Graceful Shutdown ---
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received. Closing database and shutting down gracefully...');
  try {
    // Assuming dbAPI exports a close function or the db instance itself
    if (dbAPI && typeof dbAPI.close === 'function') {
        await dbAPI.close(); // Use an async close function if available
        console.log('Database connection closed successfully.');
    } else if (dbAPI && dbAPI.db && typeof dbAPI.db.close === 'function') {
        // Fallback if the db instance is exported directly
        await new Promise((resolve, reject) => {
            dbAPI.db.close(err => {
                if (err) {
                    console.error('Error closing database via db.close():', err.message);
                    reject(err);
                } else {
                    console.log('Database connection closed successfully via db.close().');
                    resolve();
                }
            });
        });
    } else {
        console.warn('No explicit close function found or exported for the database API.');
    }
  } catch (err) {
      console.error('Error during graceful shutdown:', err.message);
      process.exit(1); // Exit with error code if shutdown fails
  } finally {
      console.log('Server shutdown complete.');
      process.exit(0); // Exit cleanly
  }
});
