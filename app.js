const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs').promises;
const session = require('express-session');
const cookieParser = require('cookie-parser');

// Import database server API functions
const dbAPI = require('./database'); // !!! Make sure that './database' points to database.js file

// Setup
const app = express();
const router = express.Router();
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret_key_12345',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24, // 1 day
        httpOnly: true
    }
}));

// File reader Setup
const storage = multer.diskStorage({
    destination: path.join(__dirname, 'database', 'pictures'),
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
app.use(express.static(path.join(__dirname, 'html')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/images', express.static(path.join(__dirname, 'database', 'pictures')));

// Auth.
function requireAdminLogin(req, res, next) {
    if (req.session && req.session.isAdmin) {
        return next();
    } else {
        console.log('Access Denied: Admin login required.');
        res.redirect('/adminlogin?error=unauthorized');
    }
}

// Routes

router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'html', 'home.html')));
router.get('/home', (req, res) => res.sendFile(path.join(__dirname, 'html', 'home.html')));
router.get('/detail', (req, res) => res.sendFile(path.join(__dirname, 'html', 'detail.html')));
router.get('/search', (req, res) => res.sendFile(path.join(__dirname, 'html', 'search.html')));
router.get('/team', (req, res) => res.sendFile(path.join(__dirname, 'html', 'team.html')));
router.get('/allproduct', (req, res) => res.sendFile(path.join(__dirname, 'html', 'allproduct.html')));
router.get('/html/header.html', (req, res) => res.sendFile(path.join(__dirname, 'html', 'header.html')));
router.get('/html/footer.html', (req, res) => res.sendFile(path.join(__dirname, 'html', 'footer.html')));

// Admin Login/Logout
router.get('/adminlogin', (req, res) => {
    if (req.session && req.session.isAdmin) {
       return res.redirect('/product');
    }
    res.sendFile(path.join(__dirname, 'html', 'adminlogin.html'));
});

router.post('/admin/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.redirect('/adminlogin?error=missing');

    try {
        const admin = await dbAPI.getAdminByEmail(email);
        if (!admin) return res.redirect('/adminlogin?error=invalid');

        if (password === admin.Password) {
            req.session.isAdmin = true;
            req.session.email = admin.Email;
            req.session.save(err => {
                if (err) return res.redirect('/adminlogin?error=sessionerror');
                res.redirect('/product');
            });
        } else {
            return res.redirect('/adminlogin?error=invalid');
        }
    } catch (err) {
        console.error('Admin login error:', err);
        return res.redirect('/adminlogin?error=dberror');
    }
});

router.get('/admin/logout', (req, res) => {
    req.session.destroy(err => {
        res.clearCookie('connect.sid');
        if (err) console.error('Error clearout session:', err);
        res.redirect('/adminlogin?logout=success');
    });
});

// Admin Auth. Required Routes
router.get('/product', requireAdminLogin, (req, res) => res.sendFile(path.join(__dirname, 'html', 'product.html')));
router.get('/adminaccount', requireAdminLogin, (req, res) => res.sendFile(path.join(__dirname, 'html', 'adminaccount.html')));
router.get('/inventory', requireAdminLogin, (req, res) => res.sendFile(path.join(__dirname, 'html', 'inventory.html')));
router.get('/admin/dashboard', requireAdminLogin, (req, res) => res.redirect('/product'));


// Product API Routes

// Multer Error Handler Middleware
function handleUploadErrors(err, req, res, next) {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `File upload error: ${err.message}` });
    } else if (err) {
        return res.status(400).json({ error: err.message });
    }
    next();
}

// Add Product
router.post('/add-product', requireAdminLogin, (req, res, next) => {
    upload(req, res, (err) => {
        handleUploadErrors(err, req, res, () => {
            addProductHandler(req, res);
        });
    });
});

// Add Product API
async function addProductHandler(req, res) {
    const { ProductID, ProductName, FullProductName, Details, Description, Price, Category } = req.body;
    const imageName = req.file ? req.file.filename : null;

    if (!ProductID || !ProductName || !FullProductName || !Price || !Category) {
        if (req.file) fs.unlink(req.file.path).catch(console.error);
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    try {
        const result = await dbAPI.addProductWithImage(req.body, imageName);
        res.status(201).json(result);
    } catch (err) {
        console.error('Add product error:', err);
        if (req.file) fs.unlink(req.file.path).catch(console.error);

        if (err.code === 'SQLITE_CONSTRAINT') {
             return res.status(409).json({ error: `Product with ID ${ProductID} already exists.`, details: err.message });
         }
        res.status(500).json({ error: 'Failed to add product.', details: err.message });
    }
}

// Delete Product
router.delete('/api/products/:productID', requireAdminLogin, async (req, res) => {
    const { productID } = req.params;
    const picturesDir = path.join(__dirname, 'database', 'pictures');
    if (!productID) return res.status(400).json({ error: 'Missing Product ID.' });

    try {
        let matchingFiles = [];
        try {
            const files = await fs.readdir(picturesDir);
            const filePattern = new RegExp(`^${productID}-\\d+-\\d+\\..+$`);
            matchingFiles = files.filter(file => filePattern.test(file));
        } catch (readErr) {
            if (readErr.code !== 'ENOENT') console.warn(`Could not read pictures dir: ${readErr.message}`);
        }
        const deleteFilePromises = matchingFiles.map(file =>
            fs.unlink(path.join(picturesDir, file)).catch(err => console.error(`Error deleting file ${file}:`, err))
        );
        await Promise.all(deleteFilePromises);

        await dbAPI.deleteProductAndInfo(productID);
        res.json({ message: `Product ${productID} deleted successfully.` });

    } catch (err) {
        console.error('Delete product error:', err);
        if (err.status === 404) {
            return res.status(404).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to delete product.', details: err.message });
    }
});

// Debug Route
router.get('/debug', requireAdminLogin, (req, res) => res.sendFile(path.join(__dirname, 'html', 'debug.html')));

// Debug Query
router.post('/run-query', requireAdminLogin, async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query cannot be empty.' });

    try {
        const result = await dbAPI.runDebugQuery(query);
        res.json(result);
    } catch (err) {
        console.error('Debug query error:', err);
        res.status(400).json({ error: 'Failed to execute query.', details: err.message });
    }
});

// Admin Profile API
router.get('/api/admin/profile', requireAdminLogin, async (req, res) => {
    const userEmail = req.session.email;
    if (!userEmail) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const profile = await dbAPI.getAdminProfile(userEmail);
        res.json(profile || { Email: userEmail, message: "Profile not created." });
    } catch (err) {
        console.error('Get profile error:', err);
        res.status(500).json({ error: 'Failed to retrieve profile.' });
    }
});

router.post('/api/admin/profile', requireAdminLogin, async (req, res) => {
    const userEmail = req.session.email;
    const { firstName, lastName, dob, address } = req.body;

    if (!userEmail) return res.status(401).json({ error: 'Unauthorized' });
    if (!firstName || !lastName) return res.status(400).json({ error: 'First/Last name required.' });

    try {
        const result = await dbAPI.saveAdminProfile({ firstName, lastName, dob, address, email: userEmail });
        const message = result.changes > 0 ? 'Profile updated successfully' : 'Profile created successfully';
        const status = result.changes > 0 ? 200 : 201;
        res.status(status).json({ message });
    } catch (err) {
        console.error('Save profile error:', err);
        res.status(500).json({ error: 'Failed to save profile.', details: err.message });
    }
});

// Public Product API
app.get('/api/products', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const itemsPerPage = parseInt(req.query.limit) || 25;
    if (page < 1 || itemsPerPage < 1 || itemsPerPage > 100) {
        return res.status(400).json({ error: 'Invalid pagination parameters.' });
    }

    try {
        const [totalProducts, products] = await Promise.all([
            dbAPI.countTotalProducts(),
            dbAPI.getProductsPaginated(page, itemsPerPage)
        ]);
        const totalPages = Math.ceil(totalProducts / itemsPerPage);
        res.json({ products, currentPage: page, totalPages, totalProducts, itemsPerPage });
    } catch (err) {
        console.error('Get products error:', err);
        res.status(500).json({ error: 'Failed to retrieve products.', details: err.message });
    }
});

app.get('/api/products/all', async (req, res) => {
    try {
        const products = await dbAPI.getAllProducts();
        res.json({ products });
    } catch (err) {
        console.error('Get all products error:', err);
        res.status(500).json({ error: 'Failed to retrieve all products.', details: err.message });
    }
});

app.get('/api/products/:productID', async (req, res) => {
    const { productID } = req.params;
    if (!productID) return res.status(400).json({ error: 'Product ID required.' });

    try {
        const product = await dbAPI.getProductById(productID);
        if (product) {
            res.json(product);
        } else {
            res.status(404).json({ message: 'Product not found' });
        }
    } catch (err) {
        console.error('Get product by ID error:', err);
        res.status(500).json({ error: 'Failed to retrieve product.', details: err.message });
    }
});

app.get('/api/product_images/:productID', async (req, res) => {
    const { productID } = req.params;
    if (!productID) return res.status(400).json({ error: 'Product ID required.' });

    try {
        const images = await dbAPI.getProductImages(productID);
        res.json(images);
    } catch (err) {
        console.error('Get product images error:', err);
        res.status(500).json({ error: 'Failed to retrieve images.', details: err.message });
    }
});

app.use('/', router);
app.use((req, res, next) => {
    res.status(404).type('text/plain').send('404 Not Found');
});

// Error Handler
app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err.stack);
    const statusCode = err.status || 500;
    const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message;
    res.status(statusCode).json({
         error: message,
         ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
});

// Server Start
const PORT = 3030;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Shutdown
process.on('SIGTERM', () => {
  dbAPI.db.close((err) => {
    if (err) console.error('Error closing database:', err.message);
    else console.log('Database closed.');
    process.exit(0);
  });
});