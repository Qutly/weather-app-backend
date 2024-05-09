import cors from "cors";
import express from "express";
import session from "express-session";
import passport from "passport";
import passportLocal from "passport-local";
import bcrypt from "bcrypt";
import connection from "./db.js";

const app = express();

const LocalStrategy = passportLocal.Strategy;

app.use(cors({
    origin: "http://localhost:3000",
    credentials: true
}));

app.use(express.urlencoded({extended: false}));
app.use(express.json());
app.use(
    session({
        secret: "secret",
        resave: true,
        saveUninitialized: true,
    })
)

app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy((username, password, done) => {
    connection.query('SELECT * FROM Użytkownik WHERE NazwaUżytkownika = ?', [username], (error, results) => {
        if (error) {
            throw error;
        }
        if (results.length === 0) {
            return done(null, false); 
        }
        const user = results[0];
        bcrypt.compare(password, user.Hasło, (err, result) => {
            if (err) {
                throw err;
            }
            if (result === true) {
                if(user.Zablokowany) {
                    return done(null, false);
                }
                return done(null, user); 
            } else {
                return done(null, false); 
            }
        });
    });
}));

passport.serializeUser((user, cb) => {
    cb(null, user.IdUżytkownika);
});

passport.deserializeUser((id, cb) => {
    connection.query('SELECT * FROM Użytkownik WHERE idUżytkownika = ?', [id], (error, results) => {
        if (error) {
            return cb(error);
        }
        
        if (results.length === 0) {
            return cb(null, false);
        }
        
        const user = results[0];
        const userInformation = {
            id: user.IdUżytkownika,
            username: user.NazwaUżytkownika,
            email: user.Email,
            admin: user.Admin,
            temperature: user.czyTemperatura,
            pressure: user.czyCiśnienie,
            humidity: user.czyWilgotność,
            blocked: user.Zablokowany
        };
        
        cb(null, userInformation);
    });
});

app.post("/register", async (req, res) => {
    const { username, password, email } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    connection.query('SELECT COUNT(*) AS emailCount FROM Użytkownik WHERE Email = ? OR NazwaUżytkownika = ?', [email, username], (error, results) => {
        if (error) {
            res.status(500).json("Server error");
            return;
        }
        
        const { emailCount } = results[0];

        if (emailCount > 0) {
            res.status(409).json("Email or username already exists");
            return;
        }

        connection.query('INSERT INTO Użytkownik (NazwaUżytkownika, Email, Hasło) VALUES (?, ?, ?)',
            [username, email, hashedPassword],
            (error) => {
                if (error) {
                    return res.status(400).json("Error during user registration");
                }

                return res.status(200).json("Success");
            });
    });
});

app.post("/login", passport.authenticate("local"), (req, res) => {
    return res.status(200).json("Successfully logged in");
});

app.get("/user", (req, res) => {
    return res.send(req.user);
});

app.post("/logout", (req, res, next) => {
    req.logout(function(err) {
        if(err) {return next(err);}
        return res.status(200).json("Succesfully logged out");
    });
});

app.get("/stations", (req, res) => {

    connection.query('SELECT * FROM Stacja_Pomiarowa', (error, results) => {
      if (error) {
        return res.status(500).json('Internal Server Error');
      }
  
      if (!results || results.length === 0) {
        return res.status(404).json('No stations found');
      }
  
      return res.status(200).json(results);
    });
});

app.get("/get_users", (req, res) => {
    connection.query('SELECT * FROM Użytkownik', (error, results) => {
        if (error) {
          return res.status(500).json('Internal Server Error');
        }
    
        if (!results || results.length === 0) {
          return res.status(404).json('No stations found');
        }
    
        return res.status(200).json(results);
      });
});

app.post("/add_station", (req, res) => {

    const { stationName, country, city, address, lat, long } = req.body;

    connection.query('INSERT INTO Stacja_Pomiarowa (NazwaStacji, Kraj, Miasto, Adres, Koordynata_x, Koordyanta_y) VALUES (?, ?, ?, ?, ?, ?)', 
        [stationName, country, city, address, lat, long],
        (error) => {
            if(error) {
                return res.status(400).json("Error during inserting station");
            }
            return res.status(200).json("Succesfully inserted station");
        })
})

app.post("/remove_station", (req, res) => {
    const { id, name, password } = req.body;
    connection.query('SELECT * FROM Użytkownik WHERE IdUżytkownika = ?', [id], (error, results) => {
        if (error) {
            return res.status(500).json('Wystąpił błąd podczas przetwarzania żądania');
        } else {
            if (results.length === 0) {
                return res.status(404).json('Nie znaleziono użytkownika o podanym id');
            } else {
                const user = results[0];
                if (!user.Admin) {
                    return res.status(403).json('Brak uprawnień administratora');
                } else {
                    bcrypt.compare(password, user.Hasło, (bcryptErr, isMatch) => {
                        if (bcryptErr) {
                            return res.status(500).json('Wystąpił błąd podczas przetwarzania żądania');
                        } else if (!isMatch) {
                            return res.status(401).json('Nieprawidłowe hasło');
                        } else {
                            connection.query('DELETE FROM Stacja_Pomiarowa WHERE NazwaStacji = ?', [name], (deleteError, deleteResult) => {
                                if (deleteError) {
                                    return res.status(500).json('Wystąpił błąd podczas usuwania stacji pomiarowej');
                                } else {
                                    return res.status(200).json('Stacja pomiarowa została pomyślnie usunięta');
                                }
                            });
                        }
                    });
                }
            }
        }
    });
});

app.post("/block_user", (req, res) => {
    const { userId } = req.body;
    console.log(userId)
    connection.query('UPDATE Użytkownik SET Zablokowany = ? WHERE IdUżytkownika = ?', [true, userId], (error, results) => {
        if (error) {
            return res.status(500).json('Internal Server Error');
        }

        if (results.affectedRows === 0) {
            return res.status(404).json('User not found');
        } 

        else {
            return res.status(200).json('User blocked successfully');
        }
    });
});

app.post("/rank_user", (req, res) => {
    const { id } = req.body;

    connection.query('UPDATE Użytkownik SET Admin = ? WHERE IdUżytkownika = ?', [true, id], (error, results) => {
        if (error) {
            return res.status(500).json('Internal Server Error');
        }

        if (results.affectedRows === 0) {
            return res.status(404).json('User not found');
        }

        return res.status(200).json('User ranked successfully');
    });
})

app.post("/upload", (req, res) => {
    
    const { id, temperature, humidity, pressure } = req.body;
    
    connection.query('UPDATE Użytkownik SET czyTemperatura = ?, czyWilgotność = ?, czyCiśnienie = ? WHERE IdUżytkownika = ?',
        [temperature, humidity, pressure, id],
        (updateError, updateResults) => {
            if (updateError) {;
                res.status(500).json('Internal Server Error');
                return;
            }
            return res.status(200).json('Settings updated successfully');
    });
});

app.listen(5001, () => {
    console.log("App is running on port 5001");
});