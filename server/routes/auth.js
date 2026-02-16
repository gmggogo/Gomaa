const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

function readFile(fileName) {
    const filePath = path.join(__dirname, "..", "data", fileName);
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

router.post("/login", (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ error: "Missing fields" });
    }

    let users = [];

    if (role === "admin") users = readFile("admins.json");
    else if (role === "company") users = readFile("companies.json");
    else if (role === "dispatcher") users = readFile("dispatchers.json");
    else if (role === "driver") users = readFile("drivers.json");
    else return res.status(400).json({ error: "Invalid role" });

    const user = users.find(
        u => u.username === username && u.password === password
    );

    if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
    }

    res.json({
        success: true,
        user: {
            id: user.id,
            name: user.name,
            username: user.username,
            role
        }
    });
});

module.exports = router;