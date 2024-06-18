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
            return res.status(500).json("Server error");
        }
        
        const { emailCount } = results[0];

        if (emailCount > 0) {
            return res.status(409).json("Email or username already exists");
        }

        connection.query('INSERT INTO Użytkownik (NazwaUżytkownika, Email, Hasło) VALUES (?, ?, ?)',
            [username, email, hashedPassword],
            (error, results) => {
                if (error) {
                    return res.status(400).json("Error during user registration");
                }
                
                const userId = results.insertId;
                connection.query('SELECT IdUrządzenia FROM Stacja_Pomiarowa', (error, stations) => {
                    if(error) {
                    return res.status(500).json("Error fetching stations");
                }
                
                const stationIds = stations.map(station => station.IdUrządzenia);
                const insertValues = stationIds.map(stationId => [userId, stationId]);
                
                insertValues.map(item => {
                    connection.query('INSERT INTO Interesująca_Stacja (UżytkownikIdUżytkownika, StacjaPomiarowaIdUrządzenia) VALUES (?, ?)', [item[0], item[1]], (error) => {
                        if(error) {
                            return res.status(500).json("Error inserting user's interesting stations");
                        }
                    })
                })
            })
        });
    });
    return res.status(200).json();
});

app.post("/login", passport.authenticate("local"), (req, res) => {
    return res.status(200).json();
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

    connection.beginTransaction((err) => {
        if (err) {
            return res.status(500).json("Error starting transaction");
        }

        connection.query('INSERT INTO Stacja_Pomiarowa (NazwaStacji, Kraj, Miasto, Adres, Koordynata_x, Koordyanta_y) VALUES (?, ?, ?, ?, ?, ?)',
            [stationName, country, city, address, lat, long],
            (error, results) => {
                if (error) {
                    return connection.rollback(() => {
                        res.status(400).json("Error during inserting station");
                    });
                }

                const newStationId = results.insertId;

                connection.query('SELECT IdUżytkownika FROM Użytkownik', (error, userResults) => {
                    if (error) {
                        return connection.rollback(() => {
                            res.status(400).json("Error fetching user IDs");
                        });
                    }

                    const userIds = userResults.map(user => user.IdUżytkownika);

                    const values = userIds.map(userId => [userId, newStationId]);

                    connection.query('INSERT INTO Interesująca_Stacja (UżytkownikIdUżytkownika, StacjaPomiarowaIdUrządzenia) VALUES ?', [values], (error) => {
                        if (error) {
                            return connection.rollback(() => {
                                res.status(400).json("Error inserting into Interesująca_Stacja");
                            });
                        }

                        connection.commit((err) => {
                            if (err) {
                                return connection.rollback(() => {
                                    res.status(500).json("Error committing transaction");
                                });
                            }

                            return res.status(200).json("Successfully inserted station and updated users' interesting stations");
                        });
                    });
                });
            });
    });
});

app.post("/remove_station", (req, res) => {
    const { id, name, password } = req.body;

    connection.query('SELECT * FROM Użytkownik WHERE IdUżytkownika = ?', [id], (error, results) => {
        if (error) {
            return res.status(500).json('Wystąpił błąd podczas przetwarzania żądania');
        }
        if (results.length === 0) {
            return res.status(404).json('Nie znaleziono użytkownika o podanym id');
        }

        const user = results[0];
        if (!user.Admin) {
            return res.status(403).json('Brak uprawnień administratora');
        }

        bcrypt.compare(password, user.Hasło, (bcryptErr, isMatch) => {
            if (bcryptErr) {
                return res.status(500).json('Wystąpił błąd podczas przetwarzania żądania');
            }
            if (!isMatch) {
                return res.status(401).json('Nieprawidłowe hasło');
            }

            connection.query('SELECT * FROM Stacja_Pomiarowa WHERE NazwaStacji = ?', [name], (stationError, stationResults) => {
                if (stationError) {
                    return res.status(500).json('Wystąpił błąd podczas przetwarzania żądania');
                }
                if (stationResults.length === 0) {
                    return res.status(404).json('Nie znaleziono stacji pomiarowej o podanej nazwie');
                }

                connection.query('DELETE FROM Stacja_Pomiarowa WHERE NazwaStacji = ?', [name], (deleteError, deleteResult) => {
                    if (deleteError) {
                        return res.status(500).json('Wystąpił błąd podczas usuwania stacji pomiarowej');
                    }
                    return res.status(200).json('Stacja pomiarowa została pomyślnie usunięta');
                });
            });
        });
    });
});


app.post("/block_user", (req, res) => {
    const { userId } = req.body;
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

app.post("/unlock_user", (req, res) => {
    const { userId } = req.body;
    connection.query('UPDATE Użytkownik SET Zablokowany = ? WHERE IdUżytkownika = ?', [false, userId], (error, results) => {
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

app.post("/get_prefered_stations", (req, res) => {
    const { id } = req.body;
    connection.query('SELECT StacjaPomiarowaIdUrządzenia, Preferowana FROM Interesująca_Stacja WHERE UżytkownikIdUżytkownika = ?', [id], (error, results) => {
        if (error) {
            return res.status(500).json("Error fetching preferred stations");
        }
        return res.status(200).json(results);
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

app.post("/degrade_user", (req, res) => {
    const { id } = req.body;

    connection.query('UPDATE Użytkownik SET Admin = ? WHERE IdUżytkownika = ?', [false, id], (error, results) => {
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
    const { id, temperature, humidity, pressure, stationList } = req.body;

    connection.query('UPDATE Użytkownik SET czyTemperatura = ?, czyWilgotność = ?, czyCiśnienie = ? WHERE IdUżytkownika = ?',
        [temperature, humidity, pressure, id],
        (updateError, updateResults) => {
            if (updateError) {
                res.status(500).json('Internal Server Error');
                return;
            }

            stationList.map(station => {
                connection.query('UPDATE Interesująca_Stacja SET Preferowana = ? WHERE UżytkownikIdUżytkownika = ? AND StacjaPomiarowaIdUrządzenia = ?',
                    [station.Preferowana, id, station.StacjaPomiarowaIdUrządzenia], (error, results) => {
                        if (error) {
                            return console.error('Error updating preferred stations:', error);
                        }
                    });
            });
        });
    return res.status(200).json('Settings updated successfully');
});

app.post("/get_measurement", async (req, res) => {
    const { id } = req.body;

    connection.query('SELECT * FROM Dana_Pomiarowa WHERE StacjaPomiarowaIdUrządzenia = ?', [id], (error, results) => {
        if (error) {
            return res.status(500).json("Internal Server Error");
        }
        if (results.length === 0) {
            return res.status(404).json("No data found for the given station ID");
        }
        return res.status(200).json(results);
    });
});

app.listen(5001, () => {
    console.log("App is running on port 5001");
});