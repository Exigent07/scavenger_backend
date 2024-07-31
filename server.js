const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 5000;

const levels = {
  1: {
    image: "level1.png",
    heading: "Level 1",
    description: "Solve this to proceed",
    flag: "FLAG123",
  },
  2: {
    image: "level2.png",
    heading: "Level 2",
    description: "Next challenge awaits",
    flag: "FLAG456",
  },
  3: {
    image: "level3.png",
    heading: "Level 3",
    description: "Can you solve this?",
    flag: "FLAG789",
  },
  4: {
    image: "level4.png",
    heading: "Level 4",
    description: "One step closer",
    flag: "FLAG101",
  },
  5: {
    image: "level5.png",
    heading: "Level 5",
    description: "Final challenge",
    flag: "FLAG202",
  },
};

app.use(
  session({
    secret: "find_me_if_you_can",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, httpOnly: true, maxAge: 1000 * 60 * 60 * 24 },
  })
);

app.use(bodyParser.json());
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use((req, res, next) => {
  console.log("Session ID:", req.sessionID);
  console.log("Session Data:", req.session);
  next();
});

const dbPath = path.resolve(__dirname, "database.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening database", err);
  } else {
    console.log("Connected to SQLite database");

    db.run(
      `CREATE TABLE IF NOT EXISTS Users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teamName TEXT,
        memberName1 TEXT,
        memberName2 TEXT,
        memberName3 TEXT,
        email TEXT UNIQUE,
        password TEXT,
        phone TEXT
      )`,
      (err) => {
        if (err) {
          console.error("Error creating Users table", err);
        } else {
          console.log("Users table created or already exists");
        }
      }
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS Progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        level INTEGER,
        progress INTEGER,
        FOREIGN KEY (userId) REFERENCES Users (id)
      )`,
      (err) => {
        if (err) {
          console.error("Error creating Progress table", err);
        } else {
          console.log("Progress table created or already exists");
        }
      }
    );
  }
});

async function rules() {
  return `1. Complete all levels to win special swag.
  2. Each level has a unique flag.
  3. You can receive a goodie for each level by visiting the stall.
  4. Submitting an incorrect flag might result in penalties.
  5. The event ends on 2024-08-02 at 12:00 PM.`;
}

app.post("/api/register", (req, res) => {
  const {
    teamName,
    memberName1,
    memberName2,
    memberName3,
    email,
    password,
    phone,
  } = req.body;
  console.log("Register request received:", req.body);

  db.run(
    `INSERT INTO Users (teamName, memberName1, memberName2, memberName3, email, password, phone) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [teamName, memberName1, memberName2, memberName3, email, password, phone],
    function (err) {
      if (err) {
        console.error("Error saving data", err);
        res.status(400).json({ message: "Error saving data", error: err });
      } else {
        req.session.user = { id: this.lastID, teamName, email };
        console.log("Registration successful, user session:", req.session.user);
        res.status(201).json({ message: "Registration successful" });
      }
    }
  );
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  console.log("Login request received:", req.body);

  db.get(
    `SELECT * FROM Users WHERE email = ? AND password = ?`,
    [email, password],
    (err, row) => {
      if (err) {
        console.error("Error checking credentials", err);
        res.status(500).json({ message: "Error checking credentials" });
      } else if (row) {
        req.session.user = {
          id: row.id,
          teamName: row.teamName,
          email: row.email,
        };
        console.log("Login successful, user session:", req.session.user);
        res.status(200).json({ message: "Login successful" });
      } else {
        console.log("Login failed: Invalid credentials");
        res.status(401).json({ message: "Invalid credentials" });
      }
    }
  );
});

app.get("/api/session", (req, res) => {
  console.log("Session check request received");
  if (req.session.user) {
    console.log("Session exists, user:", req.session.user);
    res.status(200).json({ user: req.session.user });
  } else {
    console.log("No session found");
    res.status(401).json({ message: "Not logged in" });
  }
});

app.post("/api/logout", (req, res) => {
  console.log("Logout request received");
  req.session.destroy((err) => {
    if (err) {
      console.error("Error during logout", err);
      res.status(400).json({ message: "Error during logout", error: err });
    } else {
      console.log("Logout successful");
      res.status(200).json({ message: "Logout successful" });
    }
  });
});

app.get("/api/levels", (req, res) => {
  if (req.session.user) {
    const userId = req.session.user.id;

    db.all(
      `SELECT level FROM Progress WHERE userId = ? AND progress = 1`,
      [userId],
      (err, rows) => {
        if (err) {
          console.error("Error retrieving progress data", err);
          res.status(500).json({ message: "Error retrieving progress" });
        } else {
          const solvedLevels = rows.map((row) => row.level);
          const levelsWithStatus = Object.keys(levels).map((level) => ({
            level: parseInt(level, 10),
            ...levels[level],
            solved: solvedLevels.includes(parseInt(level, 10)),
          }));
          res.json(levelsWithStatus);
        }
      }
    );
  } else {
    res.status(401).json({ message: "Not logged in" });
  }
});

app.get("/api/levels/:level", (req, res) => {
  const level = parseInt(req.params.level, 10);
  if (levels[level]) {
    res.json(levels[level]);
  } else {
    res.status(404).json({ error: "Level not found" });
  }
});

app.post("/api/levels/:level/submit", (req, res) => {
  const level = parseInt(req.params.level, 10);
  const { flag } = req.body;

  if (levels[level]) {
    if (levels[level].flag === flag) {
      const userId = req.session.user?.id;

      if (userId) {
        db.run(
          `INSERT OR REPLACE INTO Progress (userId, level, progress) VALUES (?, ?, ?)`,
          [userId, level, 1],
          (err) => {
            if (err) {
              console.error("Error updating progress", err);
              res.status(500).json({ message: "Error updating progress" });
            } else {
              const nextLevelHint = `Hint for Level ${level + 1}`;
              res.json({ correct: true, nextLevelHint });
            }
          }
        );
      } else {
        res.status(401).json({ message: "User not logged in" });
      }
    } else {
      res.json({ correct: false });
    }
  } else {
    res.status(404).json({ error: "Level not found" });
  }
});

app.get("/api/profile", (req, res) => {
  if (req.session.user) {
    const userId = req.session.user.id;

    db.get(
      `SELECT teamName, memberName1, memberName2, memberName3, email FROM Users WHERE id = ?`,
      [userId],
      (err, row) => {
        if (err) {
          console.error("Error retrieving user profile", err);
          res
            .status(500)
            .json({ message: "Error retrieving profile", error: err });
        } else {
          res.status(200).json(row);
        }
      }
    );
  } else {
    res.status(401).json({ message: "Not logged in" });
  }
});

app.get("/api/stats", (req, res) => {
  if (req.session.user) {
    const userId = req.session.user.id;

    db.all(
      `SELECT level, progress FROM Progress WHERE userId = ?`,
      [userId],
      (err, rows) => {
        if (err) {
          console.error("Error retrieving progress data", err);
          res.status(500).json({ message: "Error retrieving progress data" });
        } else {
          const solvedLevels = rows
            .filter((row) => row.progress === 1)
            .map((row) => row.level);
          const levelsData = Object.keys(levels).map((level) => ({
            level: parseInt(level, 10),
            ...levels[level],
            solved: solvedLevels.includes(parseInt(level, 10)),
          }));

          rules()
            .then((rules) => {
              res.json({ solvedLevels, rules });
            })
            .catch((err) => {
              res.status(500).json({ message: "Error retrieving rules" });
            });
        }
      }
    );
  } else {
    res.status(401).json({ message: "Not logged in" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
