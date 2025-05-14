const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const port = process.env.PORT;
const JWT_SECRET = process.env.JWT_SECRET;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use((req, res, next) => {
    console.log("Route appelée:", req.path);
    console.log("Body reçu:", req.body);
    next();
});

function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            login: user.login,
            email: user.email,
            type: user.type,
        },
        JWT_SECRET,
        { expiresIn: "1h" }
    );
}

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log("mongodb connecté");
    })
    .catch((err) => {
        console.error("erreur mongodb:", err);
    });

const userSchema = new mongoose.Schema({
    id: {
        type: Number,
        required: true,
        unique: true,
        default: function () {
            return Math.floor(Date.now() / 1000);
        },
    },
    login: {
        type: String,
        required: true,
        unique: true,
        minlength: 5,
        maxlength: 20,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    type: {
        type: Boolean,
        default: false,
    },
});

// ... après les autres schémas et avant les modèles

const categorySchema = new mongoose.Schema({
    id: {
        type: Number,
        required: true,
        unique: true,
        default: function () {
            return Math.floor(Date.now() / 1000);
        },
    },
    name: {
        type: String,
        required: true,
        unique: true,
    },
    description: {
        type: String,
    },
});

const productSchema = new mongoose.Schema({
    id: {
        type: Number,
        required: true,
        unique: true,
        default: function () {
            return Math.floor(Date.now() / 1000);
        },
    },
    title: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
        min: 0,
    },
    description: {
        type: String,
        required: true,
    },
    category: {
        type: Number,
        ref: "Category",
    },
});

const Category = mongoose.model("Category", categorySchema);
const Product = mongoose.model("Product", productSchema);
const User = mongoose.model("User", userSchema);

function hashPassword(password) {
    return crypto.createHash("sha1").update(password).digest("hex");
}

const authenticateUser = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ error: "Authentification requise" });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(token, JWT_SECRET);

        const user = await User.findOne({ id: decoded.id });
        if (!user) {
            return res.status(401).json({ error: "Utilisateur non trouvé" });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({ error: "Token invalide" });
        }
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({ error: "Token expiré" });
        }
        console.error("Erreur d'authentification:", error);
        res.status(500).json({ error: "Erreur lors de l'authentification" });
    }
};

app.get("/shop", authenticateUser, async (req, res) => {
    try {
        const products = await Product.find({}, "id title price");
        res.status(200).json(products);
    } catch (error) {
        console.error("Erreur lors de la récupération des produits:", error);
        res.status(400).json({
            error: "Erreur lors de la récupération des produits",
        });
    }
});

app.get("/shop/:id", authenticateUser, async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const product = await Product.findOne({ id: productId });

        if (!product) {
            return res.status(404).json({ error: "Produit non trouvé" });
        }

        res.status(200).json(product);
    } catch (error) {
        console.error("Erreur lors de la récupération du produit:", error);
        res.status(400).json({
            error: "Erreur lors de la récupération du produit",
        });
    }
});

app.get("/shop/categorie/:categoryName", authenticateUser, async (req, res) => {
    try {
        const categoryName = req.params.categoryName;
        const category = await Category.findOne({ name: categoryName });

        if (!category) {
            return res.status(404).json({ error: "Catégorie non trouvée" });
        }

        const products = await Product.find({ category: category.id }).populate(
            {
                path: "category",
                select: "id name",
                localField: "category",
                foreignField: "id",
            }
        );

        res.status(200).json(products);
    } catch (error) {
        console.error("Erreur lors de la récupération des produits:", error);
        res.status(400).json({
            error: "Erreur lors de la récupération des produits",
        });
    }
});

app.get("/admin/categories", authenticateUser, async (req, res) => {
    try {
        if (!req.user.type) {
            return res
                .status(403)
                .json({ error: "Accès refusé, administrateur requis" });
        }

        const categories = await Category.find({}, "id name");
        res.status(200).json(categories);
    } catch (error) {
        console.error("Erreur lors de la récupération des catégories:", error);
        res.status(400).json({
            error: "Erreur lors de la récupération des catégories",
        });
    }
});

app.post("/admin/add/category", authenticateUser, async (req, res) => {
    try {
        if (!req.user.type) {
            return res
                .status(403)
                .json({ error: "Accès refusé, administrateur requis" });
        }

        const { name, description } = req.body;

        if (!name) {
            return res
                .status(400)
                .json({ error: "Le nom de la catégorie est requis" });
        }

        const existingCategory = await Category.findOne({ name });
        if (existingCategory) {
            return res
                .status(400)
                .json({ error: "Cette catégorie existe déjà" });
        }

        const newCategory = new Category({
            name,
            description,
        });

        await newCategory.save();

        res.status(201).json({
            message: "Catégorie créée avec succès",
            category: newCategory,
        });
    } catch (error) {
        console.error("Erreur lors de la création de la catégorie:", error);
        res.status(400).json({
            error: "Erreur lors de la création de la catégorie",
        });
    }
});

app.post("/admin/add/:categoryName", authenticateUser, async (req, res) => {
    try {
        if (!req.user.type) {
            return res
                .status(403)
                .json({ error: "Accès refusé, administrateur requis" });
        }

        const categoryName = req.params.categoryName;
        const { title, price, description } = req.body;

        if (!title || !price || !description) {
            return res
                .status(400)
                .json({ error: "Tous les champs sont requis" });
        }

        const category = await Category.findOne({ name: categoryName });
        if (!category) {
            return res.status(404).json({ error: "Catégorie non trouvée" });
        }

        const newProduct = new Product({
            title,
            price: parseFloat(price),
            description,
            category: category.id,
        });

        await newProduct.save();

        res.status(201).json({
            message: `Produit créé avec succès dans la catégorie ${categoryName}`,
            product: newProduct,
        });
    } catch (error) {
        console.error("Erreur lors de la création du produit:", error);
        res.status(400).json({
            error: "Erreur lors de la création du produit",
        });
    }
});

app.post("/admin/add", authenticateUser, async (req, res) => {
    try {
        if (!req.user.type) {
            return res
                .status(403)
                .json({ error: "Accès refusé, administrateur requis" });
        }

        const { title, price, description, category } = req.body;

        if (!title || !price || !description) {
            return res
                .status(400)
                .json({ error: "Tous les champs sont requis" });
        }

        if (category) {
            const categoryExists = await Category.findOne({ id: category });
            if (!categoryExists) {
                return res.status(400).json({ error: "Catégorie non trouvée" });
            }
        }

        const newProduct = new Product({
            title,
            price: parseFloat(price),
            description,
            category: category || null,
        });

        await newProduct.save();

        res.status(201).json({
            message: "Produit créé avec succès",
            product: newProduct,
        });
    } catch (error) {
        console.error("Erreur lors de la création du produit:", error);
        res.status(400).json({
            error: "Erreur lors de la création du produit",
        });
    }
});

app.post("/register", async (req, res) => {
    try {
        const { login, email, password, passwordConfirm } = req.body;

        if (!login || !email || !password || !passwordConfirm) {
            return res
                .status(400)
                .json({ error: "Tous les champs sont requis" });
        }

        if (login.length < 5 || login.length > 20) {
            return res.status(400).json({
                error: "Le login doit contenir entre 5 et 20 caractères",
            });
        }

        if (password !== passwordConfirm) {
            return res
                .status(400)
                .json({ error: "Les mots de passe ne correspondent pas" });
        }

        const existingUser = await User.findOne({
            $or: [{ login }, { email }],
        });
        if (existingUser) {
            if (existingUser.login === login) {
                return res
                    .status(400)
                    .json({ error: "Ce login est déjà utilisé" });
            }
            return res
                .status(400)
                .json({ error: "Cet email est déjà utilisé" });
        }

        const hashedPassword = hashPassword(password);
        const newUser = new User({
            login,
            email,
            password: hashedPassword,
            type: false,
        });

        await newUser.save();
        const token = generateToken(newUser);

        res.status(200).json({
            message: `Welcome ${login} !`,
            token: token,
        });
    } catch (error) {
        console.error("Erreur lors de l'inscription:", error);
        res.status(400).json({
            error: "Une erreur est survenue lors de l'inscription",
        });
    }
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res
                .status(400)
                .json({ error: "Email et mot de passe requis" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res
                .status(400)
                .json({ error: "Email ou mot de passe incorrect" });
        }

        const hashedPassword = hashPassword(password);
        if (user.password !== hashedPassword) {
            return res
                .status(400)
                .json({ error: "Email ou mot de passe incorrect" });
        }

        const token = generateToken(user);

        res.status(200).json({
            message: `Welcome ${user.login} !`,
            token: token,
        });
    } catch (error) {
        console.error("Erreur lors de la connexion:", error);
        res.status(400).json({
            error: "Erreur connexion",
        });
    }
});

app.listen(port, () => {
    console.log(`express connecté`);
});
